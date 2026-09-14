import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MentorBookingStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateMentorBookingDto, MentorBookingListQueryDto } from './mentors.dto';
import {
  formatMentorLocalDate,
  formatMentorLocalTime,
  localDateTimeParts,
  localDateWeekday,
  MENTOR_BOOKING_DURATION_MILLISECONDS,
  parseMentorLocalDate,
  resolveMentorLocalMinute,
} from './mentor-booking-time';

const mentorForSlotsSelect = {
  id: true,
  fullName: true,
  headline: true,
  profileImageUrl: true,
  timezone: true,
  availability: { select: { dayOfWeek: true, startMinute: true, endMinute: true } },
} as const;

const bookingSelect = {
  id: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  status: true,
  createdAt: true,
  mentorProfile: { select: { id: true, fullName: true, headline: true, profileImageUrl: true, timezone: true } },
} as const;

const mentorBookingListSelect = {
  ...bookingSelect,
  student: { select: { studentProfile: { select: { fullName: true } } } },
} as const;

@Injectable()
export class MentorBookingsService {
  constructor(private readonly db: PrismaService) {}

  async bookableSlots(mentorId: string, localDateInput: string, now = new Date()) {
    const date = parseMentorLocalDate(localDateInput);
    if (!date) this.invalidDate();
    const mentor = await this.db.mentorProfile.findFirst({
      where: { id: mentorId, isActive: true },
      select: mentorForSlotsSelect,
    });
    if (!mentor) this.mentorNotFound();

    const candidates = this.slotsForDate(mentor, date!, now);
    const occupied = candidates.length === 0 ? [] : await this.db.mentorBooking.findMany({
      where: {
        mentorProfileId: mentor.id,
        status: { in: [MentorBookingStatus.PENDING, MentorBookingStatus.CONFIRMED] },
        scheduledStartAt: { in: candidates.map((slot) => slot.scheduledStartAt) },
      },
      select: { scheduledStartAt: true },
    });
    const taken = new Set(occupied.map((booking) => booking.scheduledStartAt.getTime()));
    return {
      mentorId: mentor.id,
      mentorTimezone: mentor.timezone,
      date: localDateInput,
      slots: candidates.filter((slot) => !taken.has(slot.scheduledStartAt.getTime())),
    };
  }

  async create(studentUserId: string, dto: CreateMentorBookingDto, now = new Date()) {
    const start = this.parseStart(dto.scheduledStartAt);
    if (start.getTime() <= now.getTime()) this.notAvailable();
    const mentor = await this.db.mentorProfile.findFirst({
      where: { id: dto.mentorId, isActive: true },
      select: mentorForSlotsSelect,
    });
    if (!mentor) this.mentorNotFound();
    if (!this.isValidSlot(mentor, start, now)) this.notAvailable();

    try {
      const booking = await this.db.mentorBooking.create({
        data: {
          mentorProfileId: mentor.id,
          studentUserId,
          scheduledStartAt: start,
          scheduledEndAt: new Date(start.getTime() + MENTOR_BOOKING_DURATION_MILLISECONDS),
          status: MentorBookingStatus.PENDING,
        },
        select: bookingSelect,
      });
      return this.toResponse(booking);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'MENTOR_BOOKING_CONFLICT', message: 'This mentor slot has just been booked.' });
      }
      throw error;
    }
  }

  async listForMentor(mentorUserId: string, scope: MentorBookingListQueryDto['scope'] = 'upcoming', now = new Date()) {
    const mentor = await this.ownMentorProfile(mentorUserId);
    const bookings = await this.db.mentorBooking.findMany({
      where: { mentorProfileId: mentor.id, ...this.scopeWhere(scope, now) },
      orderBy: this.scopeOrder(scope),
      select: mentorBookingListSelect,
    });
    return bookings.map((booking) => ({
      ...this.toResponse(booking),
      student: { fullName: booking.student.studentProfile?.fullName ?? 'Student' },
    }));
  }

  async getForMentor(mentorUserId: string, bookingId: string) {
    const mentor = await this.ownMentorProfile(mentorUserId);
    return this.findMentorBooking(bookingId, mentor.id);
  }

  async listForStudent(studentUserId: string, scope: MentorBookingListQueryDto['scope'] = 'upcoming', now = new Date()) {
    const bookings = await this.db.mentorBooking.findMany({
      where: { studentUserId, ...this.scopeWhere(scope, now) },
      orderBy: this.scopeOrder(scope),
      select: bookingSelect,
    });
    return bookings.map((booking) => this.toResponse(booking));
  }

  async getForStudent(studentUserId: string, bookingId: string) {
    return this.findStudentBooking(bookingId, studentUserId);
  }

  async confirmForMentor(mentorUserId: string, bookingId: string) {
    const mentor = await this.ownMentorProfile(mentorUserId);
    return this.transitionForMentor(mentor.id, bookingId, MentorBookingStatus.PENDING, MentorBookingStatus.CONFIRMED);
  }

  async cancelForMentor(mentorUserId: string, bookingId: string) {
    const mentor = await this.ownMentorProfile(mentorUserId);
    return this.transitionForMentor(
      mentor.id,
      bookingId,
      [MentorBookingStatus.PENDING, MentorBookingStatus.CONFIRMED],
      MentorBookingStatus.CANCELLED,
    );
  }

  async cancelForStudent(studentUserId: string, bookingId: string) {
    const updated = await this.db.mentorBooking.updateMany({
      where: {
        id: bookingId,
        studentUserId,
        status: { in: [MentorBookingStatus.PENDING, MentorBookingStatus.CONFIRMED] },
      },
      data: { status: MentorBookingStatus.CANCELLED },
    });
    if (updated.count === 0) {
      const existing = await this.db.mentorBooking.findFirst({
        where: { id: bookingId, studentUserId },
        select: { id: true },
      });
      if (!existing) this.bookingNotFound();
      this.invalidTransition();
    }
    return this.findStudentBooking(bookingId, studentUserId);
  }

  async completeForMentor(mentorUserId: string, bookingId: string, now = new Date()) {
    const mentor = await this.ownMentorProfile(mentorUserId);
    const updated = await this.db.mentorBooking.updateMany({
      where: {
        id: bookingId,
        mentorProfileId: mentor.id,
        status: MentorBookingStatus.CONFIRMED,
        scheduledEndAt: { lte: now },
      },
      data: { status: MentorBookingStatus.COMPLETED },
    });
    if (updated.count === 0) {
      const existing = await this.db.mentorBooking.findFirst({
        where: { id: bookingId, mentorProfileId: mentor.id },
        select: { id: true, status: true, scheduledEndAt: true },
      });
      if (!existing) this.bookingNotFound();
      if (existing.status === MentorBookingStatus.CONFIRMED && existing.scheduledEndAt > now) this.tooEarlyToComplete();
      this.invalidTransition();
    }
    return this.findMentorBooking(bookingId, mentor.id);
  }

  private async transitionForMentor(
    mentorProfileId: string,
    bookingId: string,
    from: MentorBookingStatus | MentorBookingStatus[],
    to: MentorBookingStatus,
  ) {
    const updated = await this.db.mentorBooking.updateMany({
      where: { id: bookingId, mentorProfileId, status: Array.isArray(from) ? { in: from } : from },
      data: { status: to },
    });
    if (updated.count === 0) {
      const existing = await this.db.mentorBooking.findFirst({
        where: { id: bookingId, mentorProfileId },
        select: { id: true },
      });
      if (!existing) this.bookingNotFound();
      this.invalidTransition();
    }
    return this.findMentorBooking(bookingId, mentorProfileId);
  }

  private async ownMentorProfile(userId: string) {
    const mentor = await this.db.mentorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!mentor) throw new NotFoundException({ code: 'MENTOR_PROFILE_NOT_FOUND', message: 'Mentor profile not found.' });
    return mentor;
  }

  private async findMentorBooking(bookingId: string, mentorProfileId: string) {
    const booking = await this.db.mentorBooking.findFirst({ where: { id: bookingId, mentorProfileId }, select: bookingSelect });
    if (!booking) this.bookingNotFound();
    return this.toResponse(booking!);
  }

  private async findStudentBooking(bookingId: string, studentUserId: string) {
    const booking = await this.db.mentorBooking.findFirst({ where: { id: bookingId, studentUserId }, select: bookingSelect });
    if (!booking) this.bookingNotFound();
    return this.toResponse(booking!);
  }

  private scopeWhere(scope: MentorBookingListQueryDto['scope'], now: Date): Prisma.MentorBookingWhereInput {
    if (scope === 'upcoming' || !scope) {
      return {
        scheduledEndAt: { gt: now },
        status: { in: [MentorBookingStatus.PENDING, MentorBookingStatus.CONFIRMED] },
      };
    }
    if (scope === 'past') {
      return {
        OR: [
          { scheduledEndAt: { lte: now } },
          { status: { in: [MentorBookingStatus.CANCELLED, MentorBookingStatus.COMPLETED] } },
        ],
      };
    }
    return {};
  }

  private scopeOrder(scope: MentorBookingListQueryDto['scope']): Prisma.MentorBookingOrderByWithRelationInput[] {
    return scope === 'upcoming' || !scope
      ? [{ scheduledStartAt: 'asc' }, { id: 'asc' }]
      : [{ scheduledStartAt: 'desc' }, { id: 'desc' }];
  }

  private slotsForDate(
    mentor: Prisma.MentorProfileGetPayload<{ select: typeof mentorForSlotsSelect }>,
    date: NonNullable<ReturnType<typeof parseMentorLocalDate>>,
    now: Date,
  ) {
    const day = localDateWeekday(date);
    return mentor.availability
      .filter((window) => window.dayOfWeek === day)
      .flatMap((window) => {
        // Recurring windows may start between quarter hours; use the first
        // quarter-hour at or after the window start, never a partial slot.
        const first = Math.ceil(window.startMinute / 15) * 15;
        const slots: { scheduledStartAt: Date; scheduledEndAt: Date; localStartTime: string; localEndTime: string }[] = [];
        for (let minute = first; minute + 15 <= window.endMinute; minute += 15) {
          const start = resolveMentorLocalMinute(date, minute, mentor.timezone);
          if (!start || start.getTime() <= now.getTime()) continue;
          const end = new Date(start.getTime() + MENTOR_BOOKING_DURATION_MILLISECONDS);
          const expectedEnd = resolveMentorLocalMinute(date, minute + 15, mentor.timezone);
          if (!expectedEnd || expectedEnd.getTime() !== end.getTime()) continue;
          slots.push({ scheduledStartAt: start, scheduledEndAt: end, localStartTime: formatMentorLocalTime(minute), localEndTime: formatMentorLocalTime(minute + 15) });
        }
        return slots;
      })
      .sort((left, right) => left.scheduledStartAt.getTime() - right.scheduledStartAt.getTime());
  }

  private isValidSlot(mentor: Prisma.MentorProfileGetPayload<{ select: typeof mentorForSlotsSelect }>, start: Date, now: Date) {
    const local = localDateTimeParts(start, mentor.timezone);
    const date = { year: local.year, month: local.month, day: local.day };
    return this.slotsForDate(mentor, date, now).some((slot) => slot.scheduledStartAt.getTime() === start.getTime());
  }

  private parseStart(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || !/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
      throw new BadRequestException({ code: 'MENTOR_BOOKING_TIME_INVALID', message: 'scheduledStartAt must be a valid UTC timestamp.' });
    }
    return parsed;
  }

  private toResponse(booking: Prisma.MentorBookingGetPayload<{ select: typeof bookingSelect }>) {
    const start = localDateTimeParts(booking.scheduledStartAt, booking.mentorProfile.timezone);
    const end = localDateTimeParts(booking.scheduledEndAt, booking.mentorProfile.timezone);
    return {
      id: booking.id,
      mentor: booking.mentorProfile,
      scheduledStartAt: booking.scheduledStartAt,
      scheduledEndAt: booking.scheduledEndAt,
      status: booking.status,
      mentorTimezone: booking.mentorProfile.timezone,
      localDate: formatMentorLocalDate(start),
      localStartTime: formatMentorLocalTime(start.hour * 60 + start.minute),
      localEndTime: formatMentorLocalTime(end.hour * 60 + end.minute),
      createdAt: booking.createdAt,
    };
  }

  private invalidDate(): never { throw new BadRequestException({ code: 'MENTOR_BOOKING_DATE_INVALID', message: 'date must be a valid YYYY-MM-DD value.' }); }
  private notAvailable(): never { throw new BadRequestException({ code: 'MENTOR_BOOKING_NOT_AVAILABLE', message: 'This is not an available future mentor slot.' }); }
  private mentorNotFound(): never { throw new NotFoundException({ code: 'MENTOR_PROFILE_NOT_FOUND', message: 'Mentor profile not found.' }); }
  private bookingNotFound(): never { throw new NotFoundException({ code: 'MENTOR_BOOKING_NOT_FOUND', message: 'Mentor booking not found.' }); }
  private invalidTransition(): never { throw new BadRequestException({ code: 'MENTOR_BOOKING_INVALID_TRANSITION', message: 'This booking cannot transition from its current status.' }); }
  private tooEarlyToComplete(): never { throw new BadRequestException({ code: 'MENTOR_BOOKING_TOO_EARLY_TO_COMPLETE', message: 'This booking cannot be completed before its scheduled end time.' }); }
}
