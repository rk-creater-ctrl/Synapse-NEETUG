import { ConflictException, Inject, Injectable, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MentorBookingStatus, MentorVideoSessionStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { VIDEO_PROVIDER } from '../video-calls/video-provider.token';
import { VideoParticipantRole, VideoProvider } from '../video-calls/video-provider.types';

export const VIDEO_ACCESS_EARLY_WINDOW_MS = 5 * 60 * 1000;
export const VIDEO_TOKEN_MAX_TTL_MS = 5 * 60 * 1000;
export const VIDEO_ROOM_EXPIRY_GRACE_MS = 5 * 60 * 1000;

const bookingAccessSelect = {
  id: true,
  status: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  mentorProfileId: true,
  mentorProfile: { select: { fullName: true } },
  student: { select: { studentProfile: { select: { fullName: true } } } },
} as const;

type AccessBooking = Prisma.MentorBookingGetPayload<{ select: typeof bookingAccessSelect }>;
type ReadyVideoSession = { providerRoomName: string; providerRoomUrl: string; roomExpiresAt: Date };
type PersistedVideoSession = {
  status: MentorVideoSessionStatus;
  providerRoomName: string | null;
  providerRoomUrl: string | null;
  roomExpiresAt: Date | null;
};

@Injectable()
export class BookingVideoAccessService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProvider,
  ) {}

  async forStudent(studentUserId: string, bookingId: string, now = new Date()) {
    const booking = await this.db.mentorBooking.findFirst({ where: { id: bookingId, studentUserId }, select: bookingAccessSelect });
    if (!booking) this.bookingNotFound();
    return this.issueAccess(booking!, 'STUDENT', now);
  }

  async forMentor(mentorUserId: string, bookingId: string, now = new Date()) {
    const mentor = await this.db.mentorProfile.findUnique({ where: { userId: mentorUserId }, select: { id: true } });
    if (!mentor) this.bookingNotFound();
    const booking = await this.db.mentorBooking.findFirst({ where: { id: bookingId, mentorProfileId: mentor!.id }, select: bookingAccessSelect });
    if (!booking) this.bookingNotFound();
    return this.issueAccess(booking!, 'MENTOR', now);
  }

  private async issueAccess(booking: AccessBooking, role: VideoParticipantRole, now: Date) {
    this.assertEligible(booking, now);
    const session = await this.ensureVideoSession(booking);
    const tokenExpiresAt = new Date(Math.min(now.getTime() + VIDEO_TOKEN_MAX_TTL_MS, booking.scheduledEndAt.getTime()));
    if (tokenExpiresAt.getTime() <= now.getTime()) this.callEnded();
    const participantName = role === 'MENTOR'
      ? booking.mentorProfile.fullName
      : booking.student.studentProfile?.fullName ?? 'Student';
    try {
      const token = await this.provider.createParticipantToken({
        roomName: session.providerRoomName,
        participantId: `booking-${booking.id}-${role.toLowerCase()}`,
        participantName,
        role,
        expiresAt: tokenExpiresAt,
      });
      return {
        bookingId: booking.id,
        roomUrl: session.providerRoomUrl,
        participantToken: token.token,
        tokenExpiresAt: token.expiresAt,
        scheduledStartAt: booking.scheduledStartAt,
        scheduledEndAt: booking.scheduledEndAt,
      };
    } catch (error) {
      this.providerUnavailable(error);
    }
  }

  private async ensureVideoSession(booking: AccessBooking): Promise<ReadyVideoSession> {
    const existing = await this.db.mentorVideoSession.findUnique({ where: { mentorBookingId: booking.id } });
    const readyExisting = this.toReadyVideoSession(existing);
    if (readyExisting) return readyExisting;
    if (existing?.status === MentorVideoSessionStatus.PROVISIONING) this.provisioning();

    if (existing?.status === MentorVideoSessionStatus.FAILED) {
      const reclaimed = await this.db.mentorVideoSession.updateMany({
        where: { id: existing.id, status: MentorVideoSessionStatus.FAILED },
        data: { status: MentorVideoSessionStatus.PROVISIONING, providerRoomName: null, providerRoomUrl: null, roomExpiresAt: null },
      });
      if (reclaimed.count === 1) return this.provision(existing.id, booking);
      return this.resolveConcurrentSession(booking.id);
    }

    try {
      const claimed = await this.db.mentorVideoSession.create({
        data: { mentorBookingId: booking.id, provider: this.config.get<string>('VIDEO_PROVIDER') ?? 'disabled', status: MentorVideoSessionStatus.PROVISIONING },
      });
      return this.provision(claimed.id, booking);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.resolveConcurrentSession(booking.id);
      }
      throw new InternalServerErrorException({ code: 'VIDEO_SESSION_PERSISTENCE_FAILED', message: 'Video session setup could not be persisted.' });
    }
  }

  private async resolveConcurrentSession(bookingId: string): Promise<ReadyVideoSession> {
    const current = await this.db.mentorVideoSession.findUnique({ where: { mentorBookingId: bookingId } });
    const readyCurrent = this.toReadyVideoSession(current);
    if (readyCurrent) return readyCurrent;
    this.provisioning();
  }

  private async provision(sessionId: string, booking: AccessBooking): Promise<ReadyVideoSession> {
    const expiresAt = new Date(booking.scheduledEndAt.getTime() + VIDEO_ROOM_EXPIRY_GRACE_MS);
    let room: Awaited<ReturnType<VideoProvider['createRoom']>>;
    try {
      room = await this.provider.createRoom({ expiresAt });
    } catch (error) {
      await this.markFailed(sessionId);
      this.providerUnavailable(error);
    }
    try {
      const saved = await this.db.mentorVideoSession.update({
        where: { id: sessionId },
        data: { status: MentorVideoSessionStatus.READY, providerRoomName: room!.roomName, providerRoomUrl: room!.roomUrl, roomExpiresAt: room!.expiresAt },
      });
      const ready = this.toReadyVideoSession(saved);
      if (ready) return ready;
      throw new InternalServerErrorException({ code: 'VIDEO_SESSION_PERSISTENCE_FAILED', message: 'Video session setup could not be persisted.' });
    } catch (error) {
      try { await this.provider.deleteRoom(room!.roomName); } catch { /* best-effort cleanup only */ }
      await this.markFailed(sessionId);
      throw new InternalServerErrorException({ code: 'VIDEO_SESSION_PERSISTENCE_FAILED', message: 'Video session setup could not be persisted.' });
    }
  }

  private async markFailed(sessionId: string) {
    try { await this.db.mentorVideoSession.updateMany({ where: { id: sessionId, status: MentorVideoSessionStatus.PROVISIONING }, data: { status: MentorVideoSessionStatus.FAILED } }); } catch { /* preserve original provider failure */ }
  }

  private toReadyVideoSession(session: PersistedVideoSession | null | undefined): ReadyVideoSession | null {
    if (
      session?.status !== MentorVideoSessionStatus.READY ||
      !session.providerRoomName ||
      !session.providerRoomUrl ||
      !session.roomExpiresAt
    ) {
      return null;
    }
    return {
      providerRoomName: session.providerRoomName,
      providerRoomUrl: session.providerRoomUrl,
      roomExpiresAt: session.roomExpiresAt,
    };
  }

  private assertEligible(booking: AccessBooking, now: Date) {
    if (booking.status !== MentorBookingStatus.CONFIRMED) {
      throw new ConflictException({ code: 'VIDEO_CALL_BOOKING_NOT_CONFIRMED', message: 'Video access requires a confirmed booking.' });
    }
    if (now.getTime() < booking.scheduledStartAt.getTime() - VIDEO_ACCESS_EARLY_WINDOW_MS) this.tooEarly();
    if (now.getTime() >= booking.scheduledEndAt.getTime()) this.callEnded();
  }

  private providerUnavailable(_: unknown): never {
    throw new ServiceUnavailableException({ code: 'VIDEO_PROVIDER_UNAVAILABLE', message: 'Video access is temporarily unavailable.' });
  }
  private bookingNotFound(): never { throw new NotFoundException({ code: 'MENTOR_BOOKING_NOT_FOUND', message: 'Mentor booking not found.' }); }
  private tooEarly(): never { throw new ConflictException({ code: 'VIDEO_CALL_TOO_EARLY', message: 'Video access is not open yet.' }); }
  private callEnded(): never { throw new ConflictException({ code: 'VIDEO_CALL_ENDED', message: 'Video access has ended for this booking.' }); }
  private provisioning(): never { throw new ConflictException({ code: 'VIDEO_SESSION_PROVISIONING', message: 'Video session provisioning is in progress. Please retry shortly.' }); }
}
