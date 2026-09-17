import { HttpException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { BookingVideoAccessService, VideoCallParticipantRole } from '../mentors/booking-video-access.service';
import { MentorVideoSessionLifecycleService } from '../mentors/mentor-video-session-lifecycle.service';

type SocketIdentity = { id: string; roles: RoleName[] };
type JoinedCall = {
  bookingId: string;
  videoSessionId: string;
  role: VideoCallParticipantRole;
  scheduledEndAt: Date;
  generation: number;
};
type VideoSocket = Socket & { data: { identity?: SocketIdentity; authentication?: Promise<void>; joinedCall?: JoinedCall } };
type CallMembers = { mentor?: string; student?: string; generation?: number };
type JoinPayload = { bookingId: string };
type SignalPayload = { bookingId: string; generation: number; offer?: unknown; answer?: unknown; candidate?: unknown };

const MAX_SIGNAL_BYTES = 64 * 1024;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const socketCorsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);

@Injectable()
@WebSocketGateway({ namespace: '/video', cors: { origin: socketCorsOrigins, credentials: true } })
export class VideoSignalingGateway implements OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly members = new Map<string, CallMembers>();
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly expiringSessions = new Set<string>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly access: BookingVideoAccessService,
    private readonly lifecycle: MentorVideoSessionLifecycleService,
  ) {}

  handleConnection(socket: VideoSocket) {
    const token = this.accessToken(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }
    socket.data.authentication = this.authenticate(socket, token);
  }

  private async authenticate(socket: VideoSocket, token: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; roles?: RoleName[] }>(token, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
      if (!payload.sub || !Array.isArray(payload.roles)) {
        socket.disconnect(true);
        return;
      }
      socket.data.identity = { id: payload.sub, roles: payload.roles };
    } catch { socket.disconnect(true); }
  }

  handleDisconnect(socket: VideoSocket) {
    const joined = socket.data.joinedCall;
    if (joined && this.hasReachedEnd(joined)) {
      void this.expireSession(joined);
      return;
    }
    this.removeMembership(socket, true);
  }

  onModuleDestroy() {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.members.clear();
  }

  @SubscribeMessage('video:join')
  async join(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    await socket.data.authentication;
    const identity = socket.data.identity;
    if (!identity || !this.isJoinPayload(payload)) {
      return this.error(socket, 'VIDEO_CALL_FORBIDDEN', 'Video access is not authorized.');
    }
    try {
      const bootstrap = await this.access.forSocket(identity.id, identity.roles, payload.bookingId);
      if (!await this.ensureExpiry(bootstrap)) {
        return this.error(socket, 'VIDEO_CALL_ENDED', 'Video access has ended for this booking.');
      }
      this.removeMembership(socket, false);
      const current = this.members.get(bootstrap.videoSessionId) ?? {};
      const key = bootstrap.participantRole === 'MENTOR' ? 'mentor' : 'student';
      const oppositeKey = key === 'mentor' ? 'student' : 'mentor';
      const previousId = current[key];
      current[key] = socket.id;
      current.generation = (current.generation ?? 0) + 1;
      this.members.set(bootstrap.videoSessionId, current);
      const joinedCall: JoinedCall = {
        bookingId: bootstrap.bookingId,
        videoSessionId: bootstrap.videoSessionId,
        role: bootstrap.participantRole,
        scheduledEndAt: bootstrap.scheduledEndAt,
        generation: current.generation,
      };
      socket.data.joinedCall = joinedCall;
      this.updateCurrentGeneration(bootstrap.videoSessionId, current);
      if (previousId && previousId !== socket.id) this.socketById(previousId)?.disconnect(true);
      await socket.join(this.roomName(bootstrap.videoSessionId));
      if (this.hasReachedEnd(joinedCall)) {
        await this.expireSession(joinedCall);
        return this.error(socket, 'VIDEO_CALL_ENDED', 'Video access has ended for this booking.');
      }
      const oppositeId = current[oppositeKey];
      if (oppositeId) {
        try {
          await this.lifecycle.activate(bootstrap.videoSessionId);
          if (this.hasReachedEnd(joinedCall)) {
            await this.expireSession(joinedCall);
            return this.error(socket, 'VIDEO_CALL_ENDED', 'Video access has ended for this booking.');
          }
        } catch (error) {
          this.removeMembership(socket, false);
          return this.applicationError(socket, error);
        }
      }
      socket.emit('video:joined', {
        bookingId: bootstrap.bookingId,
        videoSessionId: bootstrap.videoSessionId,
        participantRole: bootstrap.participantRole,
        accessExpiresAt: bootstrap.accessExpiresAt,
        generation: joinedCall.generation,
      });
      if (oppositeId) {
        this.server.to(oppositeId).emit('video:peer-joined', { bookingId: bootstrap.bookingId, participantRole: bootstrap.participantRole, generation: joinedCall.generation });
        socket.emit('video:peer-joined', { bookingId: bootstrap.bookingId, participantRole: oppositeKey === 'mentor' ? 'MENTOR' : 'STUDENT', generation: joinedCall.generation });
      }
    } catch (error) {
      this.applicationError(socket, error);
    }
  }

  @SubscribeMessage('video:offer')
  async offer(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    if (!await this.authorizeSignal(socket, payload)) return;
    if (!this.isSignalPayload(payload, 'offer')) return this.error(socket, 'VIDEO_SIGNAL_INVALID', 'Invalid video offer.');
    await this.relay(socket, payload, 'video:offer', payload.offer);
  }

  @SubscribeMessage('video:answer')
  async answer(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    if (!await this.authorizeSignal(socket, payload)) return;
    if (!this.isSignalPayload(payload, 'answer')) return this.error(socket, 'VIDEO_SIGNAL_INVALID', 'Invalid video answer.');
    await this.relay(socket, payload, 'video:answer', payload.answer);
  }

  @SubscribeMessage('video:ice-candidate')
  async iceCandidate(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    if (!await this.authorizeSignal(socket, payload)) return;
    if (!this.isSignalPayload(payload, 'candidate')) return this.error(socket, 'VIDEO_SIGNAL_INVALID', 'Invalid ICE candidate.');
    await this.relay(socket, payload, 'video:ice-candidate', payload.candidate);
  }

  @SubscribeMessage('video:leave')
  async leave(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    const joined = socket.data.joinedCall;
    if (!this.isJoinPayload(payload) || !joined || joined.bookingId !== payload.bookingId) return this.error(socket, 'VIDEO_CALL_FORBIDDEN', 'Video access is not authorized.');
    if (this.hasReachedEnd(joined)) {
      await this.expireSession(joined);
      return;
    }
    this.removeMembership(socket, true);
  }

  private async relay(socket: VideoSocket, payload: SignalPayload, event: string, signal: unknown) {
    const joined = await this.authorizeSignal(socket, payload);
    if (!joined) return;
    const members = this.members.get(joined.videoSessionId);
    const oppositeId = joined.role === 'MENTOR' ? members?.student : members?.mentor;
    const signalKey = event === 'video:offer' ? 'offer' : event === 'video:answer' ? 'answer' : 'candidate';
    if (oppositeId) this.server.to(oppositeId).emit(event, { bookingId: joined.bookingId, generation: joined.generation, [signalKey]: signal });
  }

  private async authorizeSignal(socket: VideoSocket, payload: unknown): Promise<JoinedCall | null> {
    const joined = socket.data.joinedCall;
    if (!joined || !this.isJoinPayload(payload) || joined.bookingId !== payload.bookingId) {
      this.error(socket, 'VIDEO_CALL_FORBIDDEN', 'Video access is not authorized.');
      return null;
    }
    const members = this.members.get(joined.videoSessionId);
    const ownSocketId = joined.role === 'MENTOR' ? members?.mentor : members?.student;
    if (ownSocketId !== socket.id) {
      this.error(socket, 'VIDEO_CALL_FORBIDDEN', 'Video access is not authorized.');
      return null;
    }
    const generation = (payload as { generation?: unknown }).generation;
    if (generation !== joined.generation || members?.generation !== joined.generation) {
      this.error(socket, 'VIDEO_SIGNAL_STALE', 'Video signaling is no longer current.');
      return null;
    }
    if (this.hasReachedEnd(joined)) {
      await this.expireSession(joined);
      this.error(socket, 'VIDEO_CALL_ENDED', 'Video access has ended for this booking.');
      return null;
    }
    return joined;
  }

  private removeMembership(socket: VideoSocket, notifyPeer: boolean) {
    const joined = socket.data.joinedCall;
    if (!joined) return;
    const members = this.members.get(joined.videoSessionId);
    if (members) {
      const key = joined.role === 'MENTOR' ? 'mentor' : 'student';
      const wasCurrentMember = members[key] === socket.id;
      if (wasCurrentMember) delete members[key];
      const oppositeId = joined.role === 'MENTOR' ? members.student : members.mentor;
      if (notifyPeer && wasCurrentMember && oppositeId) this.server.to(oppositeId).emit('video:peer-left', { bookingId: joined.bookingId, participantRole: joined.role, generation: joined.generation });
      if (!members.mentor && !members.student) this.members.delete(joined.videoSessionId);
    }
    socket.data.joinedCall = undefined;
    socket.leave(this.roomName(joined.videoSessionId));
  }

  private async ensureExpiry(bootstrap: {
    bookingId: string;
    videoSessionId: string;
    scheduledEndAt: Date;
    participantRole: VideoCallParticipantRole;
  }): Promise<boolean> {
    const joined: JoinedCall = {
      bookingId: bootstrap.bookingId,
      videoSessionId: bootstrap.videoSessionId,
      role: bootstrap.participantRole,
      scheduledEndAt: bootstrap.scheduledEndAt,
      generation: 0,
    };
    if (this.hasReachedEnd(joined)) {
      await this.expireSession(joined);
      return false;
    }
    if (!this.expiryTimers.has(joined.videoSessionId)) {
      this.scheduleExpiry(joined);
    }
    return true;
  }

  private scheduleExpiry(joined: JoinedCall) {
    const delay = Math.max(0, joined.scheduledEndAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      if (this.hasReachedEnd(joined)) {
        void this.expireSession(joined);
      } else {
        this.scheduleExpiry(joined);
      }
    }, Math.min(delay, MAX_TIMER_DELAY_MS));
    this.expiryTimers.set(joined.videoSessionId, timer);
  }

  private async expireSession(joined: JoinedCall) {
    if (this.expiringSessions.has(joined.videoSessionId)) return;
    this.expiringSessions.add(joined.videoSessionId);
    const timer = this.expiryTimers.get(joined.videoSessionId);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(joined.videoSessionId);
    try {
      await this.lifecycle.end(joined.videoSessionId);
      const members = this.members.get(joined.videoSessionId);
      if (!members) return;
      const socketIds = [members.mentor, members.student].filter((id): id is string => Boolean(id));
      for (const socketId of socketIds) {
        this.server.to(socketId).emit('video:session-ended', {
          bookingId: joined.bookingId,
          reason: 'SCHEDULED_END',
        });
      }
      for (const socketId of socketIds) {
        const socket = this.socketById(socketId);
        if (socket) {
          this.removeMembership(socket, false);
          socket.disconnect(true);
        }
      }
      this.members.delete(joined.videoSessionId);
    } finally {
      this.expiringSessions.delete(joined.videoSessionId);
    }
  }

  private hasReachedEnd(joined: JoinedCall) {
    return Date.now() >= joined.scheduledEndAt.getTime();
  }

  private isJoinPayload(value: unknown): value is JoinPayload {
    return typeof value === 'object' && value !== null && typeof (value as { bookingId?: unknown }).bookingId === 'string' && (value as { bookingId: string }).bookingId.length > 0 && (value as { bookingId: string }).bookingId.length <= 191;
  }

  private isSignalPayload(value: unknown, field: 'offer' | 'answer' | 'candidate'): value is SignalPayload {
    if (!this.isJoinPayload(value)) return false;
    const generation = (value as { generation?: unknown }).generation;
    if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 1) return false;
    const signal = (value as SignalPayload)[field];
    if (typeof signal !== 'object' || signal === null) return false;
    try { return JSON.stringify(signal).length <= MAX_SIGNAL_BYTES; } catch { return false; }
  }

  private updateCurrentGeneration(videoSessionId: string, members: CallMembers) {
    const generation = members.generation;
    if (!generation) return;
    for (const socketId of [members.mentor, members.student]) {
      if (typeof socketId !== 'string') continue;
      const currentSocket = this.socketById(socketId);
      const joined = currentSocket?.data.joinedCall;
      if (joined && joined.videoSessionId === videoSessionId) joined.generation = generation;
    }
  }

  private socketById(socketId: string): VideoSocket | undefined {
    const namespaceOrRegistry = this.server.sockets as unknown;
    if (namespaceOrRegistry instanceof Map) {
      return namespaceOrRegistry.get(socketId) as VideoSocket | undefined;
    }
    if (typeof namespaceOrRegistry === 'object' && namespaceOrRegistry !== null) {
      const registry = (namespaceOrRegistry as { sockets?: unknown }).sockets;
      if (registry instanceof Map) {
        return registry.get(socketId) as VideoSocket | undefined;
      }
    }
    return undefined;
  }

  private accessToken(socket: Socket): string | null {
    const handshakeToken = socket.handshake.auth?.token;
    if (typeof handshakeToken === 'string' && handshakeToken.length > 0) return handshakeToken;
    const authorization = socket.handshake.headers.authorization;
    return typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
  }

  private roomName(videoSessionId: string) { return `mentor-video-session:${videoSessionId}`; }
  private error(socket: Socket, code: string, message: string) { socket.emit('video:error', { code, message }); }
  private applicationError(socket: Socket, error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        const details = response as { code?: unknown; message?: unknown };
        return this.error(socket, typeof details.code === 'string' ? details.code : 'VIDEO_CALL_FORBIDDEN', typeof details.message === 'string' ? details.message : 'Video access is not authorized.');
      }
    }
    this.error(socket, 'VIDEO_CALL_FORBIDDEN', 'Video access is not authorized.');
  }

}
