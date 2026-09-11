import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName, StudySessionStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateStudySessionDto } from './study-sessions.dto';

type SessionHierarchyNode = { id: string; name: string; slug: string } | null;

type StudySessionRecord = {
  id: string;
  status: StudySessionStatus;
  contextType: string;
  subjectId: string | null;
  chapterId: string | null;
  topicId: string | null;
  subtopicId: string | null;
  startedAt: Date;
  pausedAt: Date | null;
  completedAt: Date | null;
  abandonedAt: Date | null;
  lastResumedAt: Date | null;
  accumulatedSeconds: number;
  finalDurationSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
  subject: SessionHierarchyNode;
  chapter: SessionHierarchyNode;
  topic: SessionHierarchyNode;
  subtopic: SessionHierarchyNode;
};

@Injectable()
export class StudySessionsService {
  constructor(private readonly db: PrismaService) {}

  async start(studentId: string, dto: CreateStudySessionDto) {
    await this.requireActiveStudent(studentId);
    await this.validateHierarchy(dto);

    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const active = await tx.studySession.findFirst({
        where: {
          studentId,
          status: { in: [StudySessionStatus.IN_PROGRESS, StudySessionStatus.PAUSED] },
        },
        select: { id: true },
      });
      if (active) {
        throw new ConflictException({
          code: 'STUDY_SESSION_ALREADY_ACTIVE',
          message: 'A study timer session is already active.',
        });
      }

      const now = new Date();
      const session = await tx.studySession.create({
        data: {
          studentId,
          contextType: dto.contextType,
          subjectId: dto.subjectId,
          chapterId: dto.chapterId,
          topicId: dto.topicId,
          subtopicId: dto.subtopicId,
          status: StudySessionStatus.IN_PROGRESS,
          startedAt: now,
          lastResumedAt: now,
          accumulatedSeconds: 0,
        },
        select: this.sessionSelect(),
      });
      return this.toResponse(session);
    });
  }

  async current(studentId: string) {
    await this.requireActiveStudent(studentId);
    const session = await this.db.studySession.findFirst({
      where: {
        studentId,
        status: { in: [StudySessionStatus.IN_PROGRESS, StudySessionStatus.PAUSED] },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: this.sessionSelect(),
    });
    return session ? this.toResponse(session) : null;
  }

  async get(studentId: string, sessionId: string) {
    await this.requireActiveStudent(studentId);
    const session = await this.findOwned(studentId, sessionId);
    return this.toResponse(session);
  }

  async pause(studentId: string, sessionId: string) {
    await this.requireActiveStudent(studentId);
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await this.findOwned(studentId, sessionId, tx);
      if (session.status === StudySessionStatus.PAUSED) {
        return this.toResponse(session);
      }
      this.assertTransition(session.status, StudySessionStatus.PAUSED);

      const now = new Date();
      const accumulatedSeconds = session.accumulatedSeconds + this.activeElapsed(session, now);
      const updated = await tx.studySession.update({
        where: { id: session.id },
        data: {
          status: StudySessionStatus.PAUSED,
          pausedAt: now,
          accumulatedSeconds,
        },
        select: this.sessionSelect(),
      });
      return this.toResponse(updated);
    });
  }

  async resume(studentId: string, sessionId: string) {
    await this.requireActiveStudent(studentId);
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await this.findOwned(studentId, sessionId, tx);
      if (session.status === StudySessionStatus.IN_PROGRESS) {
        return this.toResponse(session);
      }
      this.assertTransition(session.status, StudySessionStatus.IN_PROGRESS);

      const now = new Date();
      const updated = await tx.studySession.update({
        where: { id: session.id },
        data: {
          status: StudySessionStatus.IN_PROGRESS,
          pausedAt: null,
          lastResumedAt: now,
        },
        select: this.sessionSelect(),
      });
      return this.toResponse(updated);
    });
  }

  async complete(studentId: string, sessionId: string) {
    await this.requireActiveStudent(studentId);
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await this.findOwned(studentId, sessionId, tx);
      if (session.status === StudySessionStatus.COMPLETED) {
        return this.toResponse(session);
      }
      this.assertTransition(session.status, StudySessionStatus.COMPLETED);

      const now = new Date();
      const finalDurationSeconds = session.accumulatedSeconds + this.activeElapsed(session, now);
      const updated = await tx.studySession.update({
        where: { id: session.id },
        data: {
          status: StudySessionStatus.COMPLETED,
          completedAt: now,
          accumulatedSeconds: finalDurationSeconds,
          finalDurationSeconds,
        },
        select: this.sessionSelect(),
      });
      return this.toResponse(updated);
    });
  }

  async abandon(studentId: string, sessionId: string) {
    await this.requireActiveStudent(studentId);
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await this.findOwned(studentId, sessionId, tx);
      if (session.status === StudySessionStatus.ABANDONED) {
        return this.toResponse(session);
      }
      this.assertTransition(session.status, StudySessionStatus.ABANDONED);

      const now = new Date();
      const accumulatedSeconds = session.accumulatedSeconds + this.activeElapsed(session, now);
      const updated = await tx.studySession.update({
        where: { id: session.id },
        data: {
          status: StudySessionStatus.ABANDONED,
          abandonedAt: now,
          accumulatedSeconds,
          finalDurationSeconds: null,
        },
        select: this.sessionSelect(),
      });
      return this.toResponse(updated);
    });
  }

  private sessionSelect() {
    return {
      id: true,
      status: true,
      contextType: true,
      subjectId: true,
      chapterId: true,
      topicId: true,
      subtopicId: true,
      startedAt: true,
      pausedAt: true,
      completedAt: true,
      abandonedAt: true,
      lastResumedAt: true,
      accumulatedSeconds: true,
      finalDurationSeconds: true,
      createdAt: true,
      updatedAt: true,
      subject: { select: { id: true, name: true, slug: true } },
      chapter: { select: { id: true, name: true, slug: true } },
      topic: { select: { id: true, name: true, slug: true } },
      subtopic: { select: { id: true, name: true, slug: true } },
    } as const;
  }

  private async findOwned(
    studentId: string,
    sessionId: string,
    client: Prisma.TransactionClient | PrismaService = this.db,
  ): Promise<StudySessionRecord> {
    const session = await client.studySession.findFirst({
      where: { id: sessionId, studentId },
      select: this.sessionSelect(),
    });
    if (!session) {
      throw new NotFoundException({
        code: 'STUDY_SESSION_NOT_FOUND',
        message: 'Study session not found.',
      });
    }
    return session;
  }

  private toResponse(session: StudySessionRecord) {
    return {
      id: session.id,
      status: session.status,
      contextType: session.contextType,
      hierarchy: {
        subject: session.subject,
        chapter: session.chapter,
        topic: session.topic,
        subtopic: session.subtopic,
      },
      startedAt: session.startedAt,
      pausedAt: session.pausedAt,
      completedAt: session.completedAt,
      abandonedAt: session.abandonedAt,
      accumulatedSeconds: session.accumulatedSeconds,
      finalDurationSeconds: session.finalDurationSeconds,
      currentDurationSeconds: this.currentDuration(session),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private currentDuration(session: StudySessionRecord) {
    if (session.status === StudySessionStatus.IN_PROGRESS) {
      return session.accumulatedSeconds + this.activeElapsed(session, new Date());
    }
    return session.finalDurationSeconds ?? session.accumulatedSeconds;
  }

  private activeElapsed(
    session: Pick<StudySessionRecord, 'status' | 'startedAt' | 'lastResumedAt'>,
    now: Date,
  ) {
    if (session.status !== StudySessionStatus.IN_PROGRESS) {
      return 0;
    }
    const segmentStart = session.lastResumedAt ?? session.startedAt;
    return Math.max(0, Math.floor((now.getTime() - segmentStart.getTime()) / 1_000));
  }

  private assertTransition(status: StudySessionStatus, target: StudySessionStatus) {
    if (
      status === StudySessionStatus.COMPLETED ||
      status === StudySessionStatus.ABANDONED
    ) {
      throw new ConflictException({
        code: 'STUDY_SESSION_INVALID_TRANSITION',
        message: `A ${status} study session cannot transition to ${target}.`,
      });
    }
  }

  private async requireActiveStudent(studentId: string) {
    const user = await this.db.user.findUnique({
      where: { id: studentId },
      select: {
        isActive: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'STUDY_SESSION_STUDENT_NOT_FOUND',
        message: 'Student not found.',
      });
    }
    if (!user.isActive || !user.roles.some(({ role }) => role.name === RoleName.STUDENT)) {
      throw new ForbiddenException({
        code: 'STUDY_SESSION_STUDENT_REQUIRED',
        message: 'Study sessions are available to active students only.',
      });
    }
  }

  private async validateHierarchy(dto: CreateStudySessionDto) {
    const [subject, chapter, topic, subtopic] = await Promise.all([
      dto.subjectId
        ? this.db.subject.findFirst({
            where: {
              id: dto.subjectId,
              isActive: true,
              isPublished: true,
              exam: { is: { isActive: true, isPublished: true } },
            },
            select: { id: true },
          })
        : null,
      dto.chapterId
        ? this.db.chapter.findFirst({
            where: {
              id: dto.chapterId,
              isActive: true,
              isPublished: true,
              academicClass: {
                is: {
                  isActive: true,
                  isPublished: true,
                  subject: { is: { isActive: true, isPublished: true, exam: { is: { isActive: true, isPublished: true } } } },
                },
              },
            },
            select: { classId: true, academicClass: { select: { subjectId: true } } },
          })
        : null,
      dto.topicId
        ? this.db.topic.findFirst({
            where: {
              id: dto.topicId,
              isActive: true,
              isPublished: true,
              chapter: {
                is: {
                  isActive: true,
                  isPublished: true,
                  academicClass: {
                    is: {
                      isActive: true,
                      isPublished: true,
                      subject: { is: { isActive: true, isPublished: true, exam: { is: { isActive: true, isPublished: true } } } },
                    },
                  },
                },
              },
            },
            select: {
              chapterId: true,
              chapter: { select: { academicClass: { select: { subjectId: true } } } },
            },
          })
        : null,
      dto.subtopicId
        ? this.db.subtopic.findFirst({
            where: {
              id: dto.subtopicId,
              isActive: true,
              isPublished: true,
              topic: {
                is: {
                  isActive: true,
                  isPublished: true,
                  chapter: {
                    is: {
                      isActive: true,
                      isPublished: true,
                      academicClass: {
                        is: {
                          isActive: true,
                          isPublished: true,
                          subject: { is: { isActive: true, isPublished: true, exam: { is: { isActive: true, isPublished: true } } } },
                        },
                      },
                    },
                  },
                },
              },
            },
            select: {
              topicId: true,
              topic: {
                select: {
                  chapterId: true,
                  chapter: { select: { academicClass: { select: { subjectId: true } } } },
                },
              },
            },
          })
        : null,
    ]);

    if ((dto.subjectId && !subject) || (dto.chapterId && !chapter) ||
      (dto.topicId && !topic) || (dto.subtopicId && !subtopic)) {
      this.invalidHierarchy();
    }

    const subjectIds = [
      dto.subjectId,
      chapter?.academicClass.subjectId,
      topic?.chapter.academicClass.subjectId,
      subtopic?.topic.chapter.academicClass.subjectId,
    ].filter((id): id is string => Boolean(id));
    const chapterIds = [dto.chapterId, topic?.chapterId, subtopic?.topic.chapterId]
      .filter((id): id is string => Boolean(id));
    const topicIds = [dto.topicId, subtopic?.topicId]
      .filter((id): id is string => Boolean(id));
    if (new Set(subjectIds).size > 1 || new Set(chapterIds).size > 1 || new Set(topicIds).size > 1) {
      this.invalidHierarchy();
    }
  }

  private invalidHierarchy(): never {
    throw new BadRequestException({
      code: 'STUDY_SESSION_INVALID_HIERARCHY',
      message: 'Study session hierarchy is invalid or not currently available.',
    });
  }
}
