import { MentorBookingStatus, MentorVideoSessionStatus } from '@prisma/client';

import { BookingVideoAccessService, VIDEO_ROOM_EXPIRY_GRACE_MS } from './booking-video-access.service';

describe('BookingVideoAccessService', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');
  const booking = (overrides: Record<string, unknown> = {}) => ({
    id: 'booking-1', status: MentorBookingStatus.CONFIRMED,
    scheduledStartAt: new Date('2026-09-15T10:04:00.000Z'),
    scheduledEndAt: new Date('2026-09-15T10:19:00.000Z'), mentorProfileId: 'mentor-1',
    mentorProfile: { fullName: 'Dr Asha' }, student: { studentProfile: { fullName: 'Student One' } }, ...overrides,
  });
  let db: Record<string, unknown>;
  let provider: Record<string, jest.Mock>;
  let service: BookingVideoAccessService;

  beforeEach(() => {
    provider = { createRoom: jest.fn(), createParticipantToken: jest.fn(), deleteRoom: jest.fn() };
    db = {
      mentorProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'mentor-1' }) },
      mentorBooking: { findFirst: jest.fn().mockResolvedValue(booking()) },
      mentorVideoSession: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    };
    service = new BookingVideoAccessService(db as never, { get: jest.fn().mockReturnValue('daily') } as never, provider as never);
  });

  it('provisions one private provider room then issues a student-scoped short-lived token', async () => {
    const sessions = db.mentorVideoSession as { create: jest.Mock; update: jest.Mock };
    sessions.create.mockResolvedValue({ id: 'video-1' });
    provider.createRoom.mockResolvedValue({ roomName: 'room-1', roomUrl: 'https://room.example', expiresAt: new Date(now.getTime() + 20 * 60 * 1000) });
    sessions.update.mockResolvedValue({
      status: MentorVideoSessionStatus.READY,
      providerRoomName: 'room-1',
      providerRoomUrl: 'https://room.example',
      roomExpiresAt: new Date(now.getTime() + 20 * 60 * 1000),
    });
    provider.createParticipantToken.mockResolvedValue({ token: 'participant-token', expiresAt: new Date(now.getTime() + 5 * 60 * 1000) });

    const result = await service.forStudent('student-1', 'booking-1', now);
    expect(provider.createRoom).toHaveBeenCalledWith({ expiresAt: new Date(booking().scheduledEndAt.getTime() + VIDEO_ROOM_EXPIRY_GRACE_MS) });
    expect(provider.createParticipantToken).toHaveBeenCalledWith(expect.objectContaining({ roomName: 'room-1', role: 'STUDENT', expiresAt: new Date(now.getTime() + 5 * 60 * 1000) }));
    expect(result).toMatchObject({ bookingId: 'booking-1', roomUrl: 'https://room.example', participantToken: 'participant-token' });
  });

  it('reuses a READY room while issuing a fresh mentor token', async () => {
    const sessions = db.mentorVideoSession as { findUnique: jest.Mock };
    sessions.findUnique.mockResolvedValue({ status: MentorVideoSessionStatus.READY, providerRoomName: 'room-1', providerRoomUrl: 'https://room.example', roomExpiresAt: new Date('2026-09-15T10:24:00.000Z') });
    provider.createParticipantToken.mockResolvedValue({ token: 'mentor-token', expiresAt: new Date(now.getTime() + 5 * 60 * 1000) });
    await service.forMentor('mentor-user', 'booking-1', now);
    expect(provider.createRoom).not.toHaveBeenCalled();
    expect(provider.createParticipantToken).toHaveBeenCalledWith(expect.objectContaining({ roomName: 'room-1', role: 'MENTOR' }));
  });

  it.each([MentorBookingStatus.PENDING, MentorBookingStatus.CANCELLED, MentorBookingStatus.COMPLETED])('rejects %s bookings before provider calls', async (status) => {
    (db.mentorBooking as { findFirst: jest.Mock }).findFirst.mockResolvedValue(booking({ status }));
    await expect(service.forStudent('student-1', 'booking-1', now)).rejects.toMatchObject({ response: { code: 'VIDEO_CALL_BOOKING_NOT_CONFIRMED' } });
    expect(provider.createRoom).not.toHaveBeenCalled();
  });

  it('enforces server-owned opening and end boundaries', async () => {
    await expect(service.forStudent('student-1', 'booking-1', new Date('2026-09-15T09:58:59.999Z'))).rejects.toMatchObject({ response: { code: 'VIDEO_CALL_TOO_EARLY' } });
    (db.mentorBooking as { findFirst: jest.Mock }).findFirst.mockResolvedValue(booking({ scheduledEndAt: now }));
    await expect(service.forStudent('student-1', 'booking-1', now)).rejects.toMatchObject({ response: { code: 'VIDEO_CALL_ENDED' } });
  });

  it('returns retryable provisioning state instead of creating another room', async () => {
    (db.mentorVideoSession as { findUnique: jest.Mock }).findUnique.mockResolvedValue({ status: MentorVideoSessionStatus.PROVISIONING });
    await expect(service.forStudent('student-1', 'booking-1', now)).rejects.toMatchObject({ response: { code: 'VIDEO_SESSION_PROVISIONING' } });
    expect(provider.createRoom).not.toHaveBeenCalled();
  });

  it('maps provider failures safely and does not mutate booking status', async () => {
    const sessions = db.mentorVideoSession as { create: jest.Mock; updateMany: jest.Mock };
    sessions.create.mockResolvedValue({ id: 'video-1' });
    sessions.updateMany.mockResolvedValue({ count: 1 });
    provider.createRoom.mockRejectedValue(new Error('provider secret response'));
    await expect(service.forStudent('student-1', 'booking-1', now)).rejects.toMatchObject({ response: { code: 'VIDEO_PROVIDER_UNAVAILABLE' } });
    expect((db.mentorBooking as { findFirst: jest.Mock }).findFirst).toHaveBeenCalled();
    expect(provider.createParticipantToken).not.toHaveBeenCalled();
  });
});
