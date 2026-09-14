import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { VIDEO_FETCH, VideoFetch } from './video-provider.token';
import {
  CreateParticipantTokenInput,
  CreateVideoRoomInput,
  ParticipantToken,
  VideoProvider,
  VideoProviderError,
  VideoRoom,
} from './video-provider.types';

const REQUEST_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

@Injectable()
export class DailyVideoProviderService implements VideoProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    @Inject(VIDEO_FETCH) private readonly request: VideoFetch,
  ) {
    this.baseUrl = (config.get<string>('DAILY_API_BASE_URL') ?? 'https://api.daily.co/v1').replace(/\/$/, '');
    this.apiKey = config.get<string>('DAILY_API_KEY');
  }

  async createRoom(input: CreateVideoRoomInput): Promise<VideoRoom> {
    const roomName = `session-${randomUUID().replace(/-/g, '')}`;
    const body = await this.call('/rooms', 'POST', {
      name: roomName,
      privacy: 'private',
      properties: { exp: this.epoch(input.expiresAt) },
    }, 'VIDEO_ROOM_CREATION_FAILED');
    const name = this.string(body.name);
    const url = this.string(body.url);
    if (!name || !url) this.invalidResponse('Room creation returned an invalid response.');
    return { roomName: name, roomUrl: url, expiresAt: input.expiresAt };
  }

  async createParticipantToken(input: CreateParticipantTokenInput): Promise<ParticipantToken> {
    const body = await this.call('/meeting-tokens', 'POST', {
      room_name: input.roomName,
      user_id: input.participantId,
      user_name: input.participantName,
      is_owner: input.role === 'MENTOR',
      exp: this.epoch(input.expiresAt),
    }, 'VIDEO_TOKEN_CREATION_FAILED');
    const token = this.string(body.token);
    if (!token) this.invalidResponse('Participant token creation returned an invalid response.');
    return { token, expiresAt: input.expiresAt };
  }

  async deleteRoom(roomName: string): Promise<void> {
    await this.call(`/rooms/${encodeURIComponent(roomName)}`, 'DELETE', undefined, 'VIDEO_ROOM_CREATION_FAILED');
  }

  private async call(path: string, method: 'POST' | 'DELETE', body: JsonRecord | undefined, failure: 'VIDEO_ROOM_CREATION_FAILED' | 'VIDEO_TOKEN_CREATION_FAILED'): Promise<JsonRecord> {
    if (!this.apiKey) {
      throw new VideoProviderError('VIDEO_PROVIDER_CONFIGURATION', 'Daily video provider is missing its API key configuration.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.request(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!response.ok) throw new VideoProviderError(failure, 'Video provider rejected the request.');
      if (method === 'DELETE') return {};
      const parsed: unknown = await response.json();
      if (!this.isRecord(parsed)) this.invalidResponse('Video provider returned an invalid response.');
      return parsed;
    } catch (error) {
      if (error instanceof VideoProviderError) throw error;
      throw new VideoProviderError('VIDEO_PROVIDER_UNAVAILABLE', 'Video provider is unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private epoch(value: Date) { return Math.floor(value.getTime() / 1000); }
  private string(value: unknown) { return typeof value === 'string' && value.length > 0 ? value : null; }
  private isRecord(value: unknown): value is JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private invalidResponse(message: string): never { throw new VideoProviderError('VIDEO_PROVIDER_INVALID_RESPONSE', message); }
}
