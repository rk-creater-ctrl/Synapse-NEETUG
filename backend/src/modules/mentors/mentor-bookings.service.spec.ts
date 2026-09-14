import { BadRequestException } from '@nestjs/common';

import { MentorBookingsService } from './mentor-bookings.service';

describe('MentorBookingsService', () => {
  const mentor = {
    id: 'mentor-1', fullName: 'Dr Asha', headline: null, profileImageUrl: null, timezone: 'Asia/Kolkata',
    availability: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
  };
  let db: Record<string, unknown>;
  let service: MentorBookingsService;

  beforeEach(() => {
    db = {
      mentorProfile: { findFirst: jest.fn().mockResolvedValue(mentor) },
      mentorBooking: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };
    service = new MentorBookingsService(db as never);
  });

  it('generates chronological future 15-minute slots from mentor-local availability', async () => {
    const result = await service.bookableSlots('mentor-1', '2026-09-14', new Date('2026-09-13T00:00:00.000Z'));
    expect(result.mentorTimezone).toBe('Asia/Kolkata');
    expect(result.slots.map((slot) => slot.localStartTime)).toEqual(['09:00', '09:15', '09:30', '09:45']);
    expect(result.slots[0].scheduledStartAt.toISOString()).toBe('2026-09-14T03:30:00.000Z');
  });

  it('does not expose occupied active slots', async () => {
    const bookings = db.mentorBooking as { findMany: jest.Mock };
    bookings.findMany.mockResolvedValue([{ scheduledStartAt: new Date('2026-09-14T03:45:00.000Z') }]);
    const result = await service.bookableSlots('mentor-1', '2026-09-14', new Date('2026-09-13T00:00:00.000Z'));
    expect(result.slots.map((slot) => slot.localStartTime)).toEqual(['09:00', '09:30', '09:45']);
  });

  it('derives the student, end time, and initial status server-side', async () => {
    const bookings = db.mentorBooking as { create: jest.Mock };
    bookings.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'booking-1', scheduledStartAt: data.scheduledStartAt, scheduledEndAt: data.scheduledEndAt,
      status: data.status, createdAt: new Date('2026-09-01T00:00:00.000Z'), mentorProfile: mentor,
    }));
    const result = await service.create('student-1', { mentorId: 'mentor-1', scheduledStartAt: '2026-09-14T03:30:00.000Z' }, new Date('2026-09-13T00:00:00.000Z'));
    expect(bookings.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ studentUserId: 'student-1' }) }));
    expect(result.scheduledEndAt.getTime() - result.scheduledStartAt.getTime()).toBe(15 * 60 * 1000);
  });

  it('rejects an invalid local date before querying bookings', async () => {
    await expect(service.bookableSlots('mentor-1', 'not-a-date')).rejects.toBeInstanceOf(BadRequestException);
  });
});
