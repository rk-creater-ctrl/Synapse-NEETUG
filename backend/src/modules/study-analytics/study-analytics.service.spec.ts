import { ForbiddenException } from '@nestjs/common';
import { RoleName, StudySessionContextType, StudySessionStatus } from '@prisma/client';

import { StudyAnalyticsService } from './study-analytics.service';

describe('StudyAnalyticsService', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');
  const student = {
    isActive: true,
    roles: [{ role: { name: RoleName.STUDENT } }],
  };
  let findMany: jest.Mock;
  let service: StudyAnalyticsService;
  let sequence: number;

  const session = (
    completedAt: string,
    finalDurationSeconds: number | null,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: `session-${sequence++}`,
    studentId: 'student-1',
    status: StudySessionStatus.COMPLETED,
    completedAt: new Date(completedAt),
    finalDurationSeconds,
    contextType: StudySessionContextType.GENERAL,
    subjectId: null,
    subject: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    findMany = jest.fn();
    sequence = 0;
    const db = {
      user: { findUnique: jest.fn().mockResolvedValue(student) },
      studySession: { findMany },
    };
    service = new StudyAnalyticsService(db as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts only positive finalized completed sessions and scopes them to the student', async () => {
    findMany.mockResolvedValue([
      session('2026-09-11T10:00:00.000Z', 600, {
        subjectId: 'physics',
        subject: { id: 'physics', name: 'Physics' },
        contextType: StudySessionContextType.QUESTION_PRACTICE,
      }),
      session('2026-09-11T09:00:00.000Z', null),
      session('2026-09-11T08:00:00.000Z', 0),
      session('2026-09-11T07:00:00.000Z', -30),
      session('2026-09-11T06:00:00.000Z', 900, {
        status: StudySessionStatus.ABANDONED,
      }),
      session('2026-09-11T05:00:00.000Z', 900, {
        status: StudySessionStatus.PAUSED,
      }),
      session('2026-09-11T04:00:00.000Z', 900, {
        status: StudySessionStatus.IN_PROGRESS,
      }),
      session('2026-09-11T03:00:00.000Z', 900, { completedAt: null }),
    ]);

    const result = await service.summary('student-1');

    expect(result.allTime).toEqual({
      totalSeconds: 600,
      sessionCount: 1,
      averageSessionSeconds: 600,
    });
    expect(JSON.stringify(result)).not.toContain('completedAt');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        studentId: 'student-1',
        status: StudySessionStatus.COMPLETED,
        finalDurationSeconds: { gt: 0 },
      }),
    }));
  });

  it('derives today, Monday-start week, month, all-time, and seven UTC recent days', async () => {
    findMany.mockResolvedValue([
      session('2026-09-11T10:00:00.000Z', 600),
      session('2026-09-10T10:00:00.000Z', 300),
      session('2026-09-07T10:00:00.000Z', 120),
      session('2026-09-01T10:00:00.000Z', 60),
      session('2026-08-31T10:00:00.000Z', 999),
    ]);

    const result = await service.summary('student-1');

    expect(result.today.totalSeconds).toBe(600);
    expect(result.week).toEqual({
      totalSeconds: 1020,
      sessionCount: 3,
      averageSessionSeconds: 340,
    });
    expect(result.month.totalSeconds).toBe(1080);
    expect(result.allTime.totalSeconds).toBe(2079);
    expect(result.recentDays).toHaveLength(7);
    expect(result.recentDays[0]).toEqual({
      date: '2026-09-05',
      totalSeconds: 0,
      sessionCount: 0,
      averageSessionSeconds: 0,
    });
    expect(result.recentDays[result.recentDays.length - 1]).toMatchObject({
      date: '2026-09-11',
      totalSeconds: 600,
      sessionCount: 1,
    });
  });

  it('groups subject and context totals without inventing an unassigned subject', async () => {
    findMany.mockResolvedValue([
      session('2026-09-11T10:00:00.000Z', 600, {
        subjectId: 'biology',
        subject: { id: 'biology', name: 'Biology' },
        contextType: StudySessionContextType.FLASHCARD,
      }),
      session('2026-09-11T09:00:00.000Z', 300, {
        subjectId: 'physics',
        subject: { id: 'physics', name: 'Physics' },
        contextType: StudySessionContextType.FLASHCARD,
      }),
      session('2026-09-11T08:00:00.000Z', 120, {
        contextType: StudySessionContextType.GENERAL,
      }),
    ]);

    const result = await service.summary('student-1');

    expect(result.bySubject).toEqual([
      { subjectId: 'biology', subjectName: 'Biology', totalSeconds: 600, sessionCount: 1 },
      { subjectId: 'physics', subjectName: 'Physics', totalSeconds: 300, sessionCount: 1 },
    ]);
    expect(result.byContextType).toEqual([
      { contextType: 'FLASHCARD', totalSeconds: 900, sessionCount: 2 },
      { contextType: 'GENERAL', totalSeconds: 120, sessionCount: 1 },
    ]);
  });

  it('uses deterministic credited duration for period, breakdown, recent-day, and average totals', async () => {
    findMany.mockResolvedValue([
      session('2026-09-11T08:00:00.000Z', 21600, {
        subjectId: 'physics',
        subject: { id: 'physics', name: 'Physics' },
        contextType: StudySessionContextType.QUESTION_PRACTICE,
      }),
      session('2026-09-11T09:00:00.000Z', 21600, {
        subjectId: 'biology',
        subject: { id: 'biology', name: 'Biology' },
        contextType: StudySessionContextType.FLASHCARD,
      }),
      session('2026-09-11T10:00:00.000Z', 21600, {
        subjectId: 'chemistry',
        subject: { id: 'chemistry', name: 'Chemistry' },
        contextType: StudySessionContextType.REVISION,
      }),
      session('2026-09-11T11:00:00.000Z', 21601, {
        subjectId: 'biology',
        subject: { id: 'biology', name: 'Biology' },
        contextType: StudySessionContextType.FLASHCARD,
      }),
      session('2026-09-10T10:00:00.000Z', 21601, {
        contextType: StudySessionContextType.GENERAL,
      }),
    ]);

    const result = await service.summary('student-1');

    expect(result.today).toEqual({
      totalSeconds: 57600,
      sessionCount: 4,
      averageSessionSeconds: 14400,
    });
    expect(result.week.totalSeconds).toBe(79200);
    expect(result.month.totalSeconds).toBe(79200);
    expect(result.allTime.totalSeconds).toBe(79200);
    expect(result.recentDays[result.recentDays.length - 1]).toMatchObject({
      date: '2026-09-11',
      totalSeconds: 57600,
      sessionCount: 4,
    });
    expect(result.bySubject).toEqual([
      { subjectId: 'biology', subjectName: 'Biology', totalSeconds: 21600, sessionCount: 2 },
      { subjectId: 'physics', subjectName: 'Physics', totalSeconds: 21600, sessionCount: 1 },
      { subjectId: 'chemistry', subjectName: 'Chemistry', totalSeconds: 14400, sessionCount: 1 },
    ]);
    expect(result.byContextType).toEqual([
      { contextType: 'FLASHCARD', totalSeconds: 21600, sessionCount: 2 },
      { contextType: 'GENERAL', totalSeconds: 21600, sessionCount: 1 },
      { contextType: 'QUESTION_PRACTICE', totalSeconds: 21600, sessionCount: 1 },
      { contextType: 'REVISION', totalSeconds: 14400, sessionCount: 1 },
    ]);
  });

  it('returns safe zero analytics when the student has no valid completed sessions', async () => {
    findMany.mockResolvedValue([]);

    const result = await service.summary('student-1');

    expect(result.today.totalSeconds).toBe(0);
    expect(result.allTime).toEqual({
      totalSeconds: 0,
      sessionCount: 0,
      averageSessionSeconds: 0,
    });
    expect(result.bySubject).toEqual([]);
    expect(result.byContextType).toEqual([]);
    expect(result.recentDays.every((day) => day.totalSeconds === 0)).toBe(true);
  });

  it('requires an active student before reading personal analytics', async () => {
    const db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: false,
          roles: [{ role: { name: RoleName.STUDENT } }],
        }),
      },
      studySession: { findMany: jest.fn() },
    };
    const restricted = new StudyAnalyticsService(db as never);

    await expect(restricted.summary('student-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.studySession.findMany).not.toHaveBeenCalled();
  });
});
