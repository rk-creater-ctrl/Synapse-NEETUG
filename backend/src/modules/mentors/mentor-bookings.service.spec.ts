import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MentorBookingStatus } from '@prisma/client';

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
      mentorProfile: { findFirst: jest.fn().mockResolvedValue(mentor), findUnique: jest.fn().mockResolvedValue({ id: 'mentor-1' }) },
      mentorBooking: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
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

  it('confirms only an owned pending booking through an atomic conditional update', async () => {
    const bookings = db.mentorBooking as { updateMany: jest.Mock; findFirst: jest.Mock };
    bookings.updateMany.mockResolvedValue({ count: 1 });
    bookings.findFirst.mockResolvedValue({
      id: 'booking-1', scheduledStartAt: new Date('2026-09-14T03:30:00.000Z'), scheduledEndAt: new Date('2026-09-14T03:45:00.000Z'),
      status: MentorBookingStatus.CONFIRMED, createdAt: new Date(), mentorProfile: mentor,
    });
    const result = await service.confirmForMentor('mentor-user', 'booking-1');
    expect(bookings.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'booking-1', mentorProfileId: 'mentor-1', status: MentorBookingStatus.PENDING },
      data: { status: MentorBookingStatus.CONFIRMED },
    }));
    expect(result.status).toBe(MentorBookingStatus.CONFIRMED);
  });

  it('allows a student to cancel an owned confirmed booking without assigning status from the client', async () => {
    const bookings = db.mentorBooking as { updateMany: jest.Mock; findFirst: jest.Mock };
    bookings.updateMany.mockResolvedValue({ count: 1 });
    bookings.findFirst.mockResolvedValue({
      id: 'booking-1', scheduledStartAt: new Date('2026-09-14T03:30:00.000Z'), scheduledEndAt: new Date('2026-09-14T03:45:00.000Z'),
      status: MentorBookingStatus.CANCELLED, createdAt: new Date(), mentorProfile: mentor,
    });
    await expect(service.cancelForStudent('student-1', 'booking-1')).resolves.toMatchObject({ status: MentorBookingStatus.CANCELLED });
    expect(bookings.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ studentUserId: 'student-1', status: { in: [MentorBookingStatus.PENDING, MentorBookingStatus.CONFIRMED] } }),
      data: { status: MentorBookingStatus.CANCELLED },
    }));
  });

  it('does not complete a confirmed booking before the server sees its scheduled end', async () => {
    const bookings = db.mentorBooking as { updateMany: jest.Mock; findFirst: jest.Mock };
    bookings.updateMany.mockResolvedValue({ count: 0 });
    bookings.findFirst.mockResolvedValue({ id: 'booking-1', status: MentorBookingStatus.CONFIRMED, scheduledEndAt: new Date('2026-09-14T04:00:00.000Z') });
    await expect(service.completeForMentor('mentor-user', 'booking-1', new Date('2026-09-14T03:45:00.000Z'))).rejects.toMatchObject({ response: { code: 'MENTOR_BOOKING_TOO_EARLY_TO_COMPLETE' } });
  });

  it('does not let another mentor transition a booking', async () => {
    const profiles = db.mentorProfile as { findUnique: jest.Mock };
    const bookings = db.mentorBooking as { updateMany: jest.Mock; findFirst: jest.Mock };
    profiles.findUnique.mockResolvedValue({ id: 'mentor-2' });
    bookings.updateMany.mockResolvedValue({ count: 0 });
    bookings.findFirst.mockResolvedValue(null);
    await expect(service.confirmForMentor('mentor-user-2', 'booking-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(bookings.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ mentorProfileId: 'mentor-2' }) }));
  });

  it('rejects duplicate or terminal transitions after the conditional update loses', async () => {
    const bookings = db.mentorBooking as { updateMany: jest.Mock; findFirst: jest.Mock };
    bookings.updateMany.mockResolvedValue({ count: 0 });
    bookings.findFirst.mockResolvedValue({ id: 'booking-1' });
    await expect(service.cancelForStudent('student-1', 'booking-1')).rejects.toMatchObject({ response: { code: 'MENTOR_BOOKING_INVALID_TRANSITION' } });
  });

  it('limits mentor booking reads to the mentor profile and exposes only a student display name', async () => {
    const bookings = db.mentorBooking as { findMany: jest.Mock };
    bookings.findMany.mockResolvedValue([{
      id: 'booking-1', scheduledStartAt: new Date('2026-09-14T03:30:00.000Z'), scheduledEndAt: new Date('2026-09-14T03:45:00.000Z'),
      status: MentorBookingStatus.PENDING, createdAt: new Date(), mentorProfile: mentor,
      student: { studentProfile: { fullName: 'Student One' } },
    }]);
    const result = await service.listForMentor('mentor-user');
    expect(bookings.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mentorProfileId: 'mentor-1' } }));
    expect(result).toMatchObject([{ student: { fullName: 'Student One' } }]);
    expect(result[0].student).not.toHaveProperty('email');
  });
});
