import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MentorBookingStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateMentorBookingDto } from './mentors.dto';
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
}
