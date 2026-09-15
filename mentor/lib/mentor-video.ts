import { MentorApiError } from './mentor-api';
import { MentorBooking } from './mentor-types';

export function canJoinMentorBooking(booking: MentorBooking): boolean {
  return booking.status === 'CONFIRMED';
}

export function mentorVideoErrorMessage(error: unknown): string {
  const code = error instanceof MentorApiError ? error.code : undefined;
  switch (code) {
    case 'VIDEO_CALL_TOO_EARLY': return 'Call access is not open yet.';
    case 'VIDEO_CALL_BOOKING_NOT_CONFIRMED': return 'This booking must be confirmed before joining.';
    case 'VIDEO_CALL_ENDED': return 'This session has ended.';
    case 'MENTOR_BOOKING_NOT_FOUND': return 'Booking not found or you do not have access.';
    default:
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        return 'Camera or microphone permission was denied.';
      }
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return 'A camera or microphone is unavailable.';
      }
      return error instanceof MentorApiError ? error.message : 'Unable to join the video call.';
  }
}
