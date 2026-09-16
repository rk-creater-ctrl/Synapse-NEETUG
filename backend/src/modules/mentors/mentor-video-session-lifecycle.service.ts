import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MentorVideoSessionStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class MentorVideoSessionLifecycleService {
  constructor(private readonly db: PrismaService) {}

  async activate(videoSessionId: string, now = new Date()): Promise<void> {
    const newlyActivated = await this.db.mentorVideoSession.updateMany({
      where: {
        id: videoSessionId,
        status: MentorVideoSessionStatus.READY,
        startedAt: null,
      },
      data: {
        status: MentorVideoSessionStatus.ACTIVE,
        startedAt: now,
      },
    });
    if (newlyActivated.count === 1) {
      return;
    }

    // Preserve a start time if a legacy/in-flight READY row already has one.
    const activatedWithExistingStart = await this.db.mentorVideoSession.updateMany({
      where: {
        id: videoSessionId,
        status: MentorVideoSessionStatus.READY,
        startedAt: { not: null },
      },
      data: { status: MentorVideoSessionStatus.ACTIVE },
    });
    if (activatedWithExistingStart.count === 1) {
      return;
    }

    const session = await this.db.mentorVideoSession.findUnique({
      where: { id: videoSessionId },
      select: { status: true },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'VIDEO_SESSION_NOT_FOUND',
        message: 'Video session not found.',
      });
    }
    if (session.status === MentorVideoSessionStatus.ENDED) {
      throw new ConflictException({
        code: 'VIDEO_CALL_ENDED',
        message: 'Video access has ended for this booking.',
      });
    }
    if (session.status !== MentorVideoSessionStatus.ACTIVE) {
      throw new ConflictException({
        code: 'VIDEO_SESSION_INVALID_STATE',
        message: 'Video session is not ready to activate.',
      });
    }
  }

  async end(videoSessionId: string, now = new Date()): Promise<void> {
    const ended = await this.db.mentorVideoSession.updateMany({
      where: {
        id: videoSessionId,
        status: { in: [MentorVideoSessionStatus.READY, MentorVideoSessionStatus.ACTIVE] },
      },
      data: {
        status: MentorVideoSessionStatus.ENDED,
        endedAt: now,
      },
    });
    if (ended.count === 1) {
      return;
    }

    const session = await this.db.mentorVideoSession.findUnique({
      where: { id: videoSessionId },
      select: { status: true },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'VIDEO_SESSION_NOT_FOUND',
        message: 'Video session not found.',
      });
    }
    if (session.status !== MentorVideoSessionStatus.ENDED) {
      throw new ConflictException({
        code: 'VIDEO_SESSION_INVALID_STATE',
        message: 'Video session cannot be ended.',
      });
    }
  }
}
