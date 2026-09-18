import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { CommunityMessagesService } from './community-messages.service';
import { CommunityService } from './community.service';

type SocketIdentity = { id: string; roles: RoleName[] };
type CommunitySocket = Socket & {
  data: {
    identity?: SocketIdentity;
    authentication?: Promise<void>;
  };
};
type CommunityPayload = { communityId: string };
type SendMessagePayload = CommunityPayload & { content: string };
type CommunitySocketSuccess<T> = { ok: true; data: T };
type CommunitySocketFailure = { ok: false; error: { code: string; message: string } };
type CommunitySocketAck<T> = CommunitySocketSuccess<T> | CommunitySocketFailure;

const MAX_COMMUNITY_ID_LENGTH = 191;
const MAX_MESSAGE_LENGTH = 4000;
const socketCorsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

@Injectable()
@WebSocketGateway({ namespace: '/community', cors: { origin: socketCorsOrigins, credentials: true } })
export class CommunityGateway {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly communities: CommunityService,
    private readonly messages: CommunityMessagesService,
  ) {}

  handleConnection(socket: CommunitySocket) {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      socket.disconnect(true);
      return;
    }

    // Store the promise before the first event can arrive; handlers await it.
    socket.data.authentication = this.authenticate(socket, token);
  }

  @SubscribeMessage('community:join')
  async join(
    @ConnectedSocket() socket: CommunitySocket,
    @MessageBody() payload: unknown,
  ): Promise<CommunitySocketAck<{ communityId: string }>> {
    const identity = await this.authenticatedIdentity(socket);
    if (!identity) return this.unauthorized();
    if (!this.isCommunityPayload(payload)) return this.invalidPayload();

    try {
      await this.communities.getForUser(identity.id, payload.communityId);
      await socket.join(this.roomName(payload.communityId));
      return { ok: true, data: { communityId: payload.communityId } };
    } catch (error) {
      return this.applicationError(error);
    }
  }

  @SubscribeMessage('community:leave')
  async leave(
    @ConnectedSocket() socket: CommunitySocket,
    @MessageBody() payload: unknown,
  ): Promise<CommunitySocketAck<{ communityId: string }>> {
    const identity = await this.authenticatedIdentity(socket);
    if (!identity) return this.unauthorized();
    if (!this.isCommunityPayload(payload)) return this.invalidPayload();

    await socket.leave(this.roomName(payload.communityId));
    return { ok: true, data: { communityId: payload.communityId } };
  }

  @SubscribeMessage('community:message:send')
  async sendMessage(
    @ConnectedSocket() socket: CommunitySocket,
    @MessageBody() payload: unknown,
  ): Promise<CommunitySocketAck<Awaited<ReturnType<CommunityMessagesService['create']>>>> {
    const identity = await this.authenticatedIdentity(socket);
    if (!identity) return this.unauthorized();
    if (!this.isSendMessagePayload(payload)) return this.invalidMessagePayload();

    try {
      const message = await this.messages.create(identity.id, payload.communityId, { content: payload.content });
      this.broadcastMessage(message);
      return { ok: true, data: message };
    } catch (error) {
      return this.applicationError(error);
    }
  }

  broadcastMessage(message: Awaited<ReturnType<CommunityMessagesService['create']>>) {
    this.server.to(this.roomName(message.communityId)).emit('community:message:new', message);
  }

  private async authenticate(socket: CommunitySocket, token: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; roles?: RoleName[] }>(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
      if (!payload.sub || !Array.isArray(payload.roles)) {
        socket.disconnect(true);
        return;
      }
      socket.data.identity = { id: payload.sub, roles: payload.roles };
    } catch {
      socket.disconnect(true);
    }
  }

  private async authenticatedIdentity(socket: CommunitySocket): Promise<SocketIdentity | null> {
    await socket.data.authentication;
    return socket.data.identity ?? null;
  }

  private isCommunityPayload(value: unknown): value is CommunityPayload {
    if (typeof value !== 'object' || value === null) return false;
    const communityId = (value as { communityId?: unknown }).communityId;
    return typeof communityId === 'string' && communityId.length > 0 && communityId.length <= MAX_COMMUNITY_ID_LENGTH;
  }

  private isSendMessagePayload(value: unknown): value is SendMessagePayload {
    if (!this.isCommunityPayload(value)) return false;
    const content = (value as { content?: unknown }).content;
    return typeof content === 'string' && content.length <= MAX_MESSAGE_LENGTH;
  }

  private roomName(communityId: string) {
    return `community:${communityId}`;
  }

  private unauthorized(): CommunitySocketFailure {
    return {
      ok: false,
      error: {
        code: 'COMMUNITY_SOCKET_UNAUTHORIZED',
        message: 'Community socket authentication is required.',
      },
    };
  }

  private invalidPayload(): CommunitySocketFailure {
    return {
      ok: false,
      error: {
        code: 'COMMUNITY_SOCKET_PAYLOAD_INVALID',
        message: 'Community socket payload is invalid.',
      },
    };
  }

  private invalidMessagePayload(): CommunitySocketFailure {
    return {
      ok: false,
      error: {
        code: 'COMMUNITY_MESSAGE_CONTENT_INVALID',
        message: 'Message content must be between 1 and 4000 characters.',
      },
    };
  }

  private applicationError(error: unknown): CommunitySocketFailure {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        const details = response as { code?: unknown; message?: unknown };
        if (typeof details.code === 'string' && typeof details.message === 'string') {
          return { ok: false, error: { code: details.code, message: details.message } };
        }
      }
    }
    return {
      ok: false,
      error: {
        code: 'COMMUNITY_SOCKET_OPERATION_FAILED',
        message: 'Community socket operation could not be completed.',
      },
    };
  }
}
