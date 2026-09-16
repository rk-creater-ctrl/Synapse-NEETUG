import { MentorBookingStatus, MentorVideoSessionStatus } from '@prisma/client';

import { BookingVideoAccessService } from './booking-video-access.service';

describe('BookingVideoAccessService', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');
  const booking = (overrides: Record<string, unknown> = {}) => ({
    id: 'booking-1', status: MentorBookingStatus.CONFIRMED,
    scheduledStartAt: new Date('2026-09-15T10:04:00.000Z'), scheduledEndAt: new Date('2026-09-15T10:19:00.000Z'), mentorProfileId: 'mentor-1', ...overrides,
  });
  let db: Record<string, unknown>;
  let lifecycle: { end: jest.Mock };
  let service: BookingVideoAccessService;

  beforeEach(() => {
    db = {
      mentorProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'mentor-1' }) },
      mentorBooking: { findFirst: jest.fn().mockResolvedValue(booking()) },
      mentorVideoSession: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'video-1' }) },
    };
    lifecycle = { end: jest.fn().mockResolvedValue(undefined) };
    service = new BookingVideoAccessService(db as never, lifecycle as never);
  });

  it('returns a non-secret student bootstrap and creates one local session', async () => {
    const result = await service.forStudent('student-1', 'booking-1', now);
    expect(result).toEqual({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'STUDENT', scheduledStartAt: booking().scheduledStartAt, scheduledEndAt: booking().scheduledEndAt, accessExpiresAt: booking().scheduledEndAt });
    expect(result).not.toHaveProperty('roomUrl');
    expect(result).not.toHaveProperty('participantToken');
    expect((db.mentorVideoSession as { create: jest.Mock }).create).toHaveBeenCalledWith({ data: { mentorBookingId: 'booking-1', status: MentorVideoSessionStatus.READY }, select: { id: true } });
  });

  it('returns a mentor bootstrap only for the mentor owner', async () => {
    await expect(service.forMentor('mentor-user', 'booking-1', now)).resolves.toMatchObject({ participantRole: 'MENTOR' });
    expect((db.mentorBooking as { findFirst: jest.Mock }).findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'booking-1', mentorProfileId: 'mentor-1' } }));
  });

  it.each([MentorBookingStatus.PENDING, MentorBookingStatus.CANCELLED, MentorBookingStatus.COMPLETED])('rejects %s bookings', async (status) => {
    (db.mentorBooking as { findFirst: jest.Mock }).findFirst.mockResolvedValue(booking({ status }));
    await expect(service.forStudent('student-1', 'booking-1', now)).rejects.toMatchObject({ response: { code: 'VIDEO_CALL_BOOKING_NOT_CONFIRMED' } });
  });

  it('enforces server-owned opening and end boundaries', async () => {
    await expect(service.forStudent('student-1', 'booking-1', new Date('2026-09-15T09:58:59.999Z'))).rejects.toMatchObject({ response: { code: 'VIDEO_CALL_TOO_EARLY' } });
    (db.mentorBooking as { findFirst: jest.Mock }).findFirst.mockResolvedValue(booking({ scheduledEndAt: now }));
    await expect(service.forStudent('student-1', 'booking-1', now)).rejects.toMatchObject({ response: { code: 'VIDEO_CALL_ENDED' } });
  });

  it('lazily ends an existing session when expired access is attempted', async () => {
    (db.mentorBooking as { findFirst: jest.Mock }).findFirst.mockResolvedValue(booking({ scheduledEndAt: now }));
    (db.mentorVideoSession as { findUnique: jest.Mock }).findUnique.mockResolvedValue({ id: 'video-1' });

    await expect(service.forStudent('student-1', 'booking-1', now)).rejects.toMatchObject({
      response: { code: 'VIDEO_CALL_ENDED' },
    });
    expect(lifecycle.end).toHaveBeenCalledWith('video-1', now);
  });

  it('reuses an existing booking-scoped local call session', async () => {
    (db.mentorVideoSession as { findUnique: jest.Mock }).findUnique.mockResolvedValue({ id: 'video-existing' });
    await expect(service.forStudent('student-1', 'booking-1', now)).resolves.toMatchObject({ videoSessionId: 'video-existing' });
    expect((db.mentorVideoSession as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it('does not resurrect an ended local call session', async () => {
    (db.mentorVideoSession as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      id: 'video-ended',
      status: MentorVideoSessionStatus.ENDED,
    });

    await expect(service.forStudent('student-1', 'booking-1', now)).rejects.toMatchObject({
      response: { code: 'VIDEO_CALL_ENDED' },
    });
    expect((db.mentorVideoSession as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });
});
