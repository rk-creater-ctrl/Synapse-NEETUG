export type VideoParticipantRole = 'STUDENT' | 'MENTOR';

export type CreateVideoRoomInput = {
  expiresAt: Date;
};

export type VideoRoom = {
  roomName: string;
  roomUrl: string;
  expiresAt: Date;
};

export type CreateParticipantTokenInput = {
  roomName: string;
  participantId: string;
  participantName: string;
  role: VideoParticipantRole;
  expiresAt: Date;
};

export type ParticipantToken = {
  token: string;
  expiresAt: Date;
};

export interface VideoProvider {
  createRoom(input: CreateVideoRoomInput): Promise<VideoRoom>;
  createParticipantToken(input: CreateParticipantTokenInput): Promise<ParticipantToken>;
  deleteRoom(roomName: string): Promise<void>;
}

export type VideoProviderErrorKind =
  | 'VIDEO_PROVIDER_DISABLED'
  | 'VIDEO_PROVIDER_CONFIGURATION'
  | 'VIDEO_PROVIDER_UNAVAILABLE'
  | 'VIDEO_PROVIDER_INVALID_RESPONSE'
  | 'VIDEO_ROOM_CREATION_FAILED'
  | 'VIDEO_TOKEN_CREATION_FAILED';

export class VideoProviderError extends Error {
  constructor(public readonly kind: VideoProviderErrorKind, message: string) {
    super(message);
    this.name = 'VideoProviderError';
  }
}
