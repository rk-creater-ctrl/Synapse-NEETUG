import { HttpException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { BookingVideoAccessService, VideoCallParticipantRole } from '../mentors/booking-video-access.service';
import { MentorVideoSessionLifecycleService } from '../mentors/mentor-video-session-lifecycle.service';

type SocketIdentity = { id: string; roles: RoleName[] };
type JoinedCall = { bookingId: string; videoSessionId: string; role: VideoCallParticipantRole };
type VideoSocket = Socket & { data: { identity?: SocketIdentity; joinedCall?: JoinedCall } };
type CallMembers = { mentor?: string; student?: string };
type JoinPayload = { bookingId: string };
type SignalPayload = { bookingId: string; offer?: unknown; answer?: unknown; candidate?: unknown };

const MAX_SIGNAL_BYTES = 64 * 1024;
const socketCorsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);

@Injectable()
@WebSocketGateway({ namespace: '/video', cors: { origin: socketCorsOrigins, credentials: true } })
export class VideoSignalingGateway implements OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly members = new Map<string, CallMembers>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly access: BookingVideoAccessService,
    private readonly lifecycle: MentorVideoSessionLifecycleService,
  ) {}

  async handleConnection(socket: VideoSocket) {
    const token = this.accessToken(socket);
    if (!token) return socket.disconnect(true);
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; roles?: RoleName[] }>(token, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
      if (!payload.sub || !Array.isArray(payload.roles)) return socket.disconnect(true);
      socket.data.identity = { id: payload.sub, roles: payload.roles };
    } catch { socket.disconnect(true); }
  }

  handleDisconnect(socket: VideoSocket) { this.removeMembership(socket, true); }
  onModuleDestroy() { this.members.clear(); }

  @SubscribeMessage('video:join')
  async join(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    const identity = socket.data.identity;
    if (!identity || !this.isJoinPayload(payload)) return this.error(socket, 'VIDEO_CALL_FORBIDDEN', 'Video access is not authorized.');
    try {
      const bootstrap = await this.access.forSocket(identity.id, identity.roles, payload.bookingId);
      this.removeMembership(socket, false);
      const current = this.members.get(bootstrap.videoSessionId) ?? {};
      const key = bootstrap.participantRole === 'MENTOR' ? 'mentor' : 'student';
      const oppositeKey = key === 'mentor' ? 'student' : 'mentor';
      const previousId = current[key];
      if (previousId && previousId !== socket.id) this.server.sockets.sockets.get(previousId)?.disconnect(true);
      current[key] = socket.id;
      this.members.set(bootstrap.videoSessionId, current);
      socket.data.joinedCall = { bookingId: bootstrap.bookingId, videoSessionId: bootstrap.videoSessionId, role: bootstrap.participantRole };
      await socket.join(this.roomName(bootstrap.videoSessionId));
      const oppositeId = current[oppositeKey];
      if (oppositeId) {
        try {
          await this.lifecycle.activate(bootstrap.videoSessionId);
        } catch (error) {
          this.removeMembership(socket, false);
          return this.applicationError(socket, error);
        }
      }
      socket.emit('video:joined', { bookingId: bootstrap.bookingId, videoSessionId: bootstrap.videoSessionId, participantRole: bootstrap.participantRole, accessExpiresAt: bootstrap.accessExpiresAt });
      if (oppositeId) {
        this.server.to(oppositeId).emit('video:peer-joined', { participantRole: bootstrap.participantRole });
        socket.emit('video:peer-joined', { participantRole: oppositeKey === 'mentor' ? 'MENTOR' : 'STUDENT' });
      }
    } catch (error) { this.applicationError(socket, error); }
  }

  @SubscribeMessage('video:offer')
  offer(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    if (!this.isSignalPayload(payload, 'offer')) return this.error(socket, 'VIDEO_SIGNAL_INVALID', 'Invalid video offer.');
    this.relay(socket, payload, 'video:offer', payload.offer);
  }

  @SubscribeMessage('video:answer')
  answer(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    if (!this.isSignalPayload(payload, 'answer')) return this.error(socket, 'VIDEO_SIGNAL_INVALID', 'Invalid video answer.');
    this.relay(socket, payload, 'video:answer', payload.answer);
  }

  @SubscribeMessage('video:ice-candidate')
  iceCandidate(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    if (!this.isSignalPayload(payload, 'candidate')) return this.error(socket, 'VIDEO_SIGNAL_INVALID', 'Invalid ICE candidate.');
    this.relay(socket, payload, 'video:ice-candidate', payload.candidate);
  }

  @SubscribeMessage('video:leave')
  leave(@ConnectedSocket() socket: VideoSocket, @MessageBody() payload: unknown) {
    if (!this.isJoinPayload(payload) || socket.data.joinedCall?.bookingId !== payload.bookingId) return this.error(socket, 'VIDEO_CALL_FORBIDDEN', 'Video access is not authorized.');
    this.removeMembership(socket, true);
  }

  private relay(socket: VideoSocket, payload: SignalPayload, event: string, signal: unknown) {
    const joined = socket.data.joinedCall;
    if (!joined || joined.bookingId !== payload.bookingId) return this.error(socket, 'VIDEO_CALL_FORBIDDEN', 'Video access is not authorized.');
    const members = this.members.get(joined.videoSessionId);
    const oppositeId = joined.role === 'MENTOR' ? members?.student : members?.mentor;
    const signalKey = event === 'video:offer' ? 'offer' : event === 'video:answer' ? 'answer' : 'candidate';
    if (oppositeId) this.server.to(oppositeId).emit(event, { bookingId: joined.bookingId, [signalKey]: signal });
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
      if (notifyPeer && wasCurrentMember && oppositeId) this.server.to(oppositeId).emit('video:peer-left', { participantRole: joined.role });
      if (!members.mentor && !members.student) this.members.delete(joined.videoSessionId);
    }
    socket.data.joinedCall = undefined;
    socket.leave(this.roomName(joined.videoSessionId));
  }

  private isJoinPayload(value: unknown): value is JoinPayload {
    return typeof value === 'object' && value !== null && typeof (value as { bookingId?: unknown }).bookingId === 'string' && (value as { bookingId: string }).bookingId.length > 0 && (value as { bookingId: string }).bookingId.length <= 191;
  }

  private isSignalPayload(value: unknown, field: 'offer' | 'answer' | 'candidate'): value is SignalPayload {
    if (!this.isJoinPayload(value)) return false;
    const signal = (value as SignalPayload)[field];
    if (typeof signal !== 'object' || signal === null) return false;
    try { return JSON.stringify(signal).length <= MAX_SIGNAL_BYTES; } catch { return false; }
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
