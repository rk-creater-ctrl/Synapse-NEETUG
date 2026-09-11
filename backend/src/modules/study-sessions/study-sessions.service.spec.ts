import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoleName, StudySessionStatus } from '@prisma/client';

import { StudySessionsService } from './study-sessions.service';

describe('StudySessionsService', () => {
  const now = new Date('2026-09-11T10:00:00.000Z');
  const student = {
    isActive: true,
    roles: [{ role: { name: RoleName.STUDENT } }],
  };
  let db: Record<string, unknown>;
  let session: Record<string, jest.Mock>;
  let service: StudySessionsService;

  const record = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-1',
    status: StudySessionStatus.IN_PROGRESS,
    contextType: 'GENERAL',
    subjectId: null,
    chapterId: null,
    topicId: null,
    subtopicId: null,
    startedAt: new Date('2026-09-11T09:59:40.000Z'),
    pausedAt: null,
    completedAt: null,
    abandonedAt: null,
    lastResumedAt: new Date('2026-09-11T09:59:40.000Z'),
    accumulatedSeconds: 10,
    finalDurationSeconds: null,
    createdAt: new Date('2026-09-11T09:59:40.000Z'),
    updatedAt: new Date('2026-09-11T09:59:40.000Z'),
    subject: null,
    chapter: null,
    topic: null,
    subtopic: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    session = {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const transaction = { studySession: session };
    db = {
      user: { findUnique: jest.fn().mockResolvedValue(student) },
      subject: { findFirst: jest.fn() },
      chapter: { findFirst: jest.fn() },
      topic: { findFirst: jest.fn() },
      subtopic: { findFirst: jest.fn() },
      studySession: session,
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    service = new StudySessionsService(db as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts an active student session with server-owned timing fields', async () => {
    session.findFirst.mockResolvedValueOnce(null);
    session.create.mockResolvedValue(record({ accumulatedSeconds: 0, startedAt: now, lastResumedAt: now }));

    await service.start('student-1', { contextType: 'GENERAL' } as never);

    expect(session.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        studentId: 'student-1',
        status: StudySessionStatus.IN_PROGRESS,
        startedAt: now,
        lastResumedAt: now,
        accumulatedSeconds: 0,
      }),
    }));
  });

  it.each([StudySessionStatus.IN_PROGRESS, StudySessionStatus.PAUSED])(
    'blocks a second start while a %s session exists',
    async (status) => {
      session.findFirst.mockResolvedValueOnce({ id: 'active-1', status });

      await expect(service.start('student-1', {} as never)).rejects.toBeInstanceOf(ConflictException);
      expect(session.create).not.toHaveBeenCalled();
    },
  );

  it('rejects inactive hierarchy context and non-student users', async () => {
    (db.subject as { findFirst: jest.Mock }).findFirst.mockResolvedValueOnce(null);
    await expect(service.start('student-1', { subjectId: 'subject-1' } as never))
      .rejects.toBeInstanceOf(BadRequestException);

    (db.user as { findUnique: jest.Mock }).findUnique.mockResolvedValueOnce({
      isActive: false,
      roles: [{ role: { name: RoleName.STUDENT } }],
    });
    await expect(service.current('student-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns null for no current session and owner-scopes session reads', async () => {
    session.findFirst.mockResolvedValueOnce(null);
    await expect(service.current('student-1')).resolves.toBeNull();

    session.findFirst.mockResolvedValueOnce(null);
    await expect(service.get('student-1', 'other-student-session')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pauses once, accumulates active seconds, and keeps repeated pause idempotent', async () => {
    session.findFirst.mockResolvedValueOnce(record());
    session.update.mockResolvedValueOnce(record({
      status: StudySessionStatus.PAUSED,
      pausedAt: now,
      accumulatedSeconds: 30,
    }));
    await service.pause('student-1', 'session-1');
    expect(session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: StudySessionStatus.PAUSED, accumulatedSeconds: 30 }),
    }));

    const paused = record({ status: StudySessionStatus.PAUSED, pausedAt: now, accumulatedSeconds: 30 });
    session.findFirst.mockResolvedValueOnce(paused);
    await service.pause('student-1', 'session-1');
    expect(session.update).toHaveBeenCalledTimes(1);
  });

  it('resumes a paused session without resetting accumulated duration', async () => {
    session.findFirst.mockResolvedValueOnce(record({ status: StudySessionStatus.PAUSED, accumulatedSeconds: 30 }));
    session.update.mockResolvedValueOnce(record({ status: StudySessionStatus.IN_PROGRESS, accumulatedSeconds: 30, lastResumedAt: now }));

    await service.resume('student-1', 'session-1');

    expect(session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: StudySessionStatus.IN_PROGRESS,
        pausedAt: null,
        lastResumedAt: now,
      }),
    }));
  });

  it('keeps repeated resume idempotent and does not reset the active segment', async () => {
    const active = record({ accumulatedSeconds: 30, lastResumedAt: new Date('2026-09-11T09:59:50.000Z') });
    session.findFirst.mockResolvedValueOnce(active);

    await service.resume('student-1', 'session-1');

    expect(session.update).not.toHaveBeenCalled();
  });

  it('completes active sessions with authoritative final duration and is idempotent', async () => {
    session.findFirst.mockResolvedValueOnce(record());
    session.update.mockResolvedValueOnce(record({
      status: StudySessionStatus.COMPLETED,
      completedAt: now,
      accumulatedSeconds: 30,
      finalDurationSeconds: 30,
    }));
    const completed = await service.complete('student-1', 'session-1');
    expect(completed.finalDurationSeconds).toBe(30);

    session.findFirst.mockResolvedValueOnce(record({
      status: StudySessionStatus.COMPLETED,
      finalDurationSeconds: 30,
      accumulatedSeconds: 30,
    }));
    await service.complete('student-1', 'session-1');
    expect(session.update).toHaveBeenCalledTimes(1);
  });

  it('completes paused sessions without counting paused wall-clock time', async () => {
    session.findFirst.mockResolvedValueOnce(record({ status: StudySessionStatus.PAUSED, accumulatedSeconds: 15 }));
    session.update.mockResolvedValueOnce(record({
      status: StudySessionStatus.COMPLETED,
      completedAt: now,
      accumulatedSeconds: 15,
      finalDurationSeconds: 15,
    }));

    await service.complete('student-1', 'session-1');
    expect(session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accumulatedSeconds: 15, finalDurationSeconds: 15 }),
    }));
  });

  it('abandons without treating accumulated duration as finalized study time', async () => {
    session.findFirst.mockResolvedValueOnce(record());
    session.update.mockResolvedValueOnce(record({
      status: StudySessionStatus.ABANDONED,
      abandonedAt: now,
      accumulatedSeconds: 30,
      finalDurationSeconds: null,
    }));
    const abandoned = await service.abandon('student-1', 'session-1');
    expect(abandoned.finalDurationSeconds).toBeNull();

    session.findFirst.mockResolvedValueOnce(record({ status: StudySessionStatus.ABANDONED }));
    await service.abandon('student-1', 'session-1');
    expect(session.update).toHaveBeenCalledTimes(1);
  });

  it('abandons paused sessions without counting paused wall-clock time', async () => {
    session.findFirst.mockResolvedValueOnce(record({ status: StudySessionStatus.PAUSED, accumulatedSeconds: 15 }));
    session.update.mockResolvedValueOnce(record({
      status: StudySessionStatus.ABANDONED,
      abandonedAt: now,
      accumulatedSeconds: 15,
      finalDurationSeconds: null,
    }));

    await service.abandon('student-1', 'session-1');

    expect(session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accumulatedSeconds: 15, finalDurationSeconds: null }),
    }));
  });

  it('rejects finalized-session transitions and derives active current duration safely', async () => {
    session.findFirst.mockResolvedValueOnce(record({ status: StudySessionStatus.ABANDONED }));
    await expect(service.complete('student-1', 'session-1')).rejects.toBeInstanceOf(ConflictException);

    session.findFirst.mockResolvedValueOnce(record());
    const current = await service.get('student-1', 'session-1');
    expect(current.currentDurationSeconds).toBe(30);
    expect(current).not.toHaveProperty('student');
  });

  it('rejects pause, resume, and abandon transitions from finalized sessions', async () => {
    session.findFirst.mockResolvedValueOnce(record({ status: StudySessionStatus.COMPLETED }));
    await expect(service.pause('student-1', 'session-1')).rejects.toBeInstanceOf(ConflictException);

    session.findFirst.mockResolvedValueOnce(record({ status: StudySessionStatus.ABANDONED }));
    await expect(service.resume('student-1', 'session-1')).rejects.toBeInstanceOf(ConflictException);

    session.findFirst.mockResolvedValueOnce(record({ status: StudySessionStatus.COMPLETED }));
    await expect(service.abandon('student-1', 'session-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
