import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { MentorBookingStatus, MentorVideoSessionStatus, Prisma, RoleName } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { MentorVideoSessionLifecycleService } from './mentor-video-session-lifecycle.service';

export const VIDEO_ACCESS_EARLY_WINDOW_MS = 5 * 60 * 1000;

const bookingAccessSelect = {
  id: true,
  status: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  mentorProfileId: true,
} as const;

type AccessBooking = Prisma.MentorBookingGetPayload<{ select: typeof bookingAccessSelect }>;
export type VideoCallParticipantRole = 'STUDENT' | 'MENTOR';
export type VideoCallBootstrap = {
  bookingId: string;
  videoSessionId: string;
  participantRole: VideoCallParticipantRole;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  accessExpiresAt: Date;
};

@Injectable()
export class BookingVideoAccessService {
  constructor(
    private readonly db: PrismaService,
    private readonly lifecycle: MentorVideoSessionLifecycleService,
  ) {}

  async forStudent(studentUserId: string, bookingId: string, now = new Date()): Promise<VideoCallBootstrap> {
    const booking = await this.db.mentorBooking.findFirst({ where: { id: bookingId, studentUserId }, select: bookingAccessSelect });
    if (!booking) this.bookingNotFound();
    return this.bootstrap(booking!, 'STUDENT', now);
  }

  async forMentor(mentorUserId: string, bookingId: string, now = new Date()): Promise<VideoCallBootstrap> {
    const mentor = await this.db.mentorProfile.findUnique({ where: { userId: mentorUserId }, select: { id: true } });
    if (!mentor) this.bookingNotFound();
    const booking = await this.db.mentorBooking.findFirst({ where: { id: bookingId, mentorProfileId: mentor!.id }, select: bookingAccessSelect });
    if (!booking) this.bookingNotFound();
    return this.bootstrap(booking!, 'MENTOR', now);
  }

  async forSocket(userId: string, roles: RoleName[], bookingId: string, now = new Date()) {
    if (roles.includes(RoleName.MENTOR)) {
      try {
        return await this.forMentor(userId, bookingId, now);
      } catch (error) {
        if (!(error instanceof NotFoundException) || !roles.includes(RoleName.STUDENT)) throw error;
      }
    }
    if (roles.includes(RoleName.STUDENT)) return this.forStudent(userId, bookingId, now);
    this.bookingNotFound();
  }

  private async bootstrap(booking: AccessBooking, participantRole: VideoCallParticipantRole, now: Date): Promise<VideoCallBootstrap> {
    await this.assertEligible(booking, now);
    const videoSessionId = await this.ensureSession(booking.id);
    return { bookingId: booking.id, videoSessionId, participantRole, scheduledStartAt: booking.scheduledStartAt, scheduledEndAt: booking.scheduledEndAt, accessExpiresAt: booking.scheduledEndAt };
  }

  private async ensureSession(mentorBookingId: string): Promise<string> {
    const existing = await this.db.mentorVideoSession.findUnique({ where: { mentorBookingId }, select: { id: true, status: true } });
    if (existing) {
      if (existing.status === MentorVideoSessionStatus.ENDED) this.sessionEnded();
      return existing.id;
    }
    try {
      const created = await this.db.mentorVideoSession.create({ data: { mentorBookingId, status: MentorVideoSessionStatus.READY }, select: { id: true } });
      return created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.db.mentorVideoSession.findUnique({ where: { mentorBookingId }, select: { id: true, status: true } });
        if (concurrent) {
          if (concurrent.status === MentorVideoSessionStatus.ENDED) this.sessionEnded();
          return concurrent.id;
        }
      }
      throw new InternalServerErrorException({ code: 'VIDEO_SESSION_PERSISTENCE_FAILED', message: 'Video session setup could not be persisted.' });
    }
  }

  private async assertEligible(booking: AccessBooking, now: Date) {
    if (booking.status !== MentorBookingStatus.CONFIRMED) {
      throw new ConflictException({ code: 'VIDEO_CALL_BOOKING_NOT_CONFIRMED', message: 'Video access requires a confirmed booking.' });
    }
    if (now.getTime() < booking.scheduledStartAt.getTime() - VIDEO_ACCESS_EARLY_WINDOW_MS) {
      throw new ConflictException({ code: 'VIDEO_CALL_TOO_EARLY', message: 'Video access is not open yet.' });
    }
    if (now.getTime() >= booking.scheduledEndAt.getTime()) {
      await this.reconcileExpiredSession(booking.id, now);
      throw new ConflictException({ code: 'VIDEO_CALL_ENDED', message: 'Video access has ended for this booking.' });
    }
  }

  private async reconcileExpiredSession(mentorBookingId: string, now: Date) {
    const session = await this.db.mentorVideoSession.findUnique({
      where: { mentorBookingId },
      select: { id: true },
    });
    if (session) {
      await this.lifecycle.end(session.id, now);
    }
  }

  private sessionEnded(): never {
    throw new ConflictException({ code: 'VIDEO_CALL_ENDED', message: 'Video access has ended for this booking.' });
  }

  private bookingNotFound(): never {
    throw new NotFoundException({ code: 'MENTOR_BOOKING_NOT_FOUND', message: 'Mentor booking not found.' });
  }
}
