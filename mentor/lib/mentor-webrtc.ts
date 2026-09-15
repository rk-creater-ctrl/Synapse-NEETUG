import { MentorApiError } from './mentor-api';

export function mentorSignalingUrl(apiUrl: string | undefined): string {
  if (!apiUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  return `${new URL(apiUrl).origin}/video`;
}

export function mentorPeerConfiguration(): RTCConfiguration {
  const stunUrl = process.env.NEXT_PUBLIC_WEBRTC_STUN_URL?.trim();
  return stunUrl ? { iceServers: [{ urls: stunUrl }] } : {};
}

export function mentorMediaErrorMessage(error: unknown): string {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Camera and microphone permission is required.';
    if (error.name === 'NotFoundError') return 'A camera or microphone is unavailable.';
    if (error.name === 'NotReadableError' || error.name === 'AbortError') return 'Camera or microphone is currently unavailable.';
  }
  return 'Unable to initialize camera and microphone.';
}

export function mentorSignalingErrorMessage(code: unknown): string {
  switch (code) {
    case 'VIDEO_CALL_TOO_EARLY': return 'Call access is not open yet.';
    case 'VIDEO_CALL_BOOKING_NOT_CONFIRMED': return 'This booking must be confirmed before joining.';
    case 'VIDEO_CALL_ENDED': return 'This session has ended.';
    case 'MENTOR_BOOKING_NOT_FOUND': return 'Booking not found or you do not have access.';
    default: return 'Unable to connect to the signaling service.';
  }
}

export function mentorAccessErrorMessage(error: unknown): string {
  if (error instanceof MentorApiError) return mentorSignalingErrorMessage(error.code);
  return 'Unable to authorize this session.';
}
