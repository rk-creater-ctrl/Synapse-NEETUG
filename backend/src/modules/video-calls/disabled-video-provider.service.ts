import { Injectable } from '@nestjs/common';

import {
  CreateParticipantTokenInput,
  CreateVideoRoomInput,
  ParticipantToken,
  VideoProvider,
  VideoProviderError,
  VideoRoom,
} from './video-provider.types';

@Injectable()
export class DisabledVideoProviderService implements VideoProvider {
  private disabled(): never {
    throw new VideoProviderError('VIDEO_PROVIDER_DISABLED', 'Video calling is not configured.');
  }

  async createRoom(_: CreateVideoRoomInput): Promise<VideoRoom> { this.disabled(); }
  async createParticipantToken(_: CreateParticipantTokenInput): Promise<ParticipantToken> { this.disabled(); }
  async deleteRoom(_: string): Promise<void> { this.disabled(); }
}
