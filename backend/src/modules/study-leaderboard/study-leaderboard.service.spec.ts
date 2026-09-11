import { ForbiddenException } from '@nestjs/common';
import { RoleName, StudySessionStatus } from '@prisma/client';

import { StudyLeaderboardService } from './study-leaderboard.service';

describe('StudyLeaderboardService', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');
  const activeStudent = {
    isActive: true,
    roles: [{ role: { name: RoleName.STUDENT } }],
  };
  let findMany: jest.Mock;
  let service: StudyLeaderboardService;
  let sequence: number;

  const session = (
    studentId: string,
    seconds: number | null,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: `session-${sequence++}`,
    studentId,
    status: StudySessionStatus.COMPLETED,
    completedAt: new Date('2026-09-11T10:00:00.000Z'),
    finalDurationSeconds: seconds,
    student: {
      id: studentId,
      isActive: true,
      roles: [{ role: { name: RoleName.STUDENT } }],
      studentProfile: { fullName: `Student ${studentId}` },
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    findMany = jest.fn();
    sequence = 0;
    const db = {
      user: { findUnique: jest.fn().mockResolvedValue(activeStudent) },
      studySession: { findMany },
    };
    service = new StudyLeaderboardService(db as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts only valid completed sessions from the current UTC day', async () => {
    findMany.mockResolvedValue([
      session('student-1', 600),
      session('student-2', null),
      session('student-3', 0),
      session('student-4', -1),
      session('student-4a', 800, { status: StudySessionStatus.IN_PROGRESS }),
      session('student-4b', 800, { status: StudySessionStatus.PAUSED }),
      session('student-4c', 800, { status: StudySessionStatus.ABANDONED }),
      session('student-4d', 800, {
        completedAt: new Date('2026-09-10T23:59:59.000Z'),
      }),
      session('student-5', 800, {
        student: {
          id: 'student-5',
          isActive: false,
          roles: [{ role: { name: RoleName.STUDENT } }],
          studentProfile: { fullName: 'Inactive' },
        },
      }),
      session('student-6', 800, {
        student: {
          id: 'student-6',
          isActive: true,
          roles: [{ role: { name: RoleName.ADMIN } }],
          studentProfile: { fullName: 'Admin' },
        },
      }),
    ]);

    const result = await service.daily('student-1');

    expect(result.date).toBe('2026-09-11');
    expect(result.entries).toEqual([
      expect.objectContaining({
        rank: 1,
        studentId: 'student-1',
        displayName: 'Student student-1',
        totalSeconds: 600,
        sessionCount: 1,
        isCurrentUser: true,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('finalDurationSeconds');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: StudySessionStatus.COMPLETED,
        completedAt: {
          gte: new Date('2026-09-11T00:00:00.000Z'),
          lt: new Date('2026-09-12T00:00:00.000Z'),
        },
        finalDurationSeconds: { gt: 0 },
      }),
    }));
  });

  it('aggregates sessions, ranks deterministically, and returns the current user outside top 50', async () => {
    const topStudents = Array.from({ length: 51 }, (_, index) =>
      session(`student-${String(index + 1).padStart(2, '0')}`, 1000 - index),
    );
    findMany.mockResolvedValue([
      ...topStudents,
      session('student-current', 10),
      session('student-01', 5),
    ]);

    const result = await service.daily('student-current');

    expect(result.entries).toHaveLength(50);
    expect(result.entries[0]).toMatchObject({ rank: 1, studentId: 'student-01', totalSeconds: 1005, sessionCount: 2 });
    expect(result.currentUser).toMatchObject({
      rank: 52,
      studentId: 'student-current',
      totalSeconds: 10,
      isCurrentUser: true,
    });
    expect(result.entries.some((entry) => entry.studentId === 'student-current')).toBe(false);
  });

  it('uses session count then student id as deterministic tie breakers', async () => {
    findMany.mockResolvedValue([
      session('student-b', 300),
      session('student-a', 300),
      session('student-b', 100),
      session('student-c', 400),
      session('student-d', 400),
    ]);

    const result = await service.daily('student-a');

    expect(result.entries.map((entry) => entry.studentId)).toEqual([
      'student-b',
      'student-c',
      'student-d',
      'student-a',
    ]);
    expect(result.entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
  });

  it('returns an empty leaderboard and unranked current user when there is no valid time', async () => {
    findMany.mockResolvedValue([]);

    await expect(service.daily('student-1')).resolves.toEqual({
      date: '2026-09-11',
      entries: [],
      currentUser: null,
    });
  });

  it('requires an active student requester before returning rankings', async () => {
    const db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: false,
          roles: [{ role: { name: RoleName.STUDENT } }],
        }),
      },
      studySession: { findMany: jest.fn() },
    };
    const restricted = new StudyLeaderboardService(db as never);

    await expect(restricted.daily('student-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.studySession.findMany).not.toHaveBeenCalled();
  });

  it('uses Monday UTC through the exclusive following Monday for weekly rankings', async () => {
    findMany.mockResolvedValue([
      session('student-1', 600, {
        completedAt: new Date('2026-09-07T00:00:00.000Z'),
      }),
      session('student-2', 500, {
        completedAt: new Date('2026-09-13T23:59:59.000Z'),
      }),
      session('student-3', 900, {
        completedAt: new Date('2026-09-06T23:59:59.000Z'),
      }),
      session('student-4', 900, {
        completedAt: new Date('2026-09-14T00:00:00.000Z'),
      }),
    ]);

    const result = await service.weekly('student-1');

    expect(result).toMatchObject({
      weekStart: '2026-09-07',
      weekEnd: '2026-09-13',
      entries: [
        expect.objectContaining({ studentId: 'student-1', totalSeconds: 600 }),
        expect.objectContaining({ studentId: 'student-2', totalSeconds: 500 }),
      ],
    });
    expect(result.entries.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(result.currentUser).toMatchObject({
      rank: 1,
      studentId: 'student-1',
      isCurrentUser: true,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        completedAt: {
          gte: new Date('2026-09-07T00:00:00.000Z'),
          lt: new Date('2026-09-14T00:00:00.000Z'),
        },
      }),
    }));
  });

  it('applies valid-session eligibility and top/current-user rules to weekly rankings', async () => {
    const topStudents = Array.from({ length: 51 }, (_, index) =>
      session(`student-${String(index + 1).padStart(2, '0')}`, 1000 - index),
    );
    findMany.mockResolvedValue([
      ...topStudents,
      session('student-current', 10),
      session('student-invalid', 999, { status: StudySessionStatus.ABANDONED }),
      session('student-null', null),
      session('student-zero', 0),
      session('student-negative', -1),
    ]);

    const result = await service.weekly('student-current');

    expect(result.entries).toHaveLength(50);
    expect(result.currentUser).toMatchObject({
      rank: 52,
      studentId: 'student-current',
      isCurrentUser: true,
    });
    expect(JSON.stringify(result)).not.toContain('finalDurationSeconds');
  });

  it('returns empty weekly entries and an unranked current user when valid time is absent', async () => {
    findMany.mockResolvedValue([]);

    await expect(service.weekly('student-1')).resolves.toEqual({
      weekStart: '2026-09-07',
      weekEnd: '2026-09-13',
      entries: [],
      currentUser: null,
    });
  });

  it('uses current-month UTC boundaries and excludes invalid, prior, and next month records', async () => {
    findMany.mockResolvedValue([
      session('student-1', 600, {
        completedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
      session('student-1', 300, {
        completedAt: new Date('2026-09-30T23:59:59.000Z'),
      }),
      session('student-2', 500, {
        completedAt: new Date('2026-08-31T23:59:59.000Z'),
      }),
      session('student-3', 500, {
        completedAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
      session('student-4', 500, { status: StudySessionStatus.PAUSED }),
      session('student-5', null),
      session('student-6', 0),
      session('student-7', -1),
      session('student-8', 500, {
        student: {
          id: 'student-8',
          isActive: false,
          roles: [{ role: { name: RoleName.STUDENT } }],
          studentProfile: { fullName: 'Inactive' },
        },
      }),
      session('student-9', 500, {
        student: {
          id: 'student-9',
          isActive: true,
          roles: [{ role: { name: RoleName.ADMIN } }],
          studentProfile: { fullName: 'Admin' },
        },
      }),
    ]);

    const result = await service.monthly('student-1');

    expect(result).toMatchObject({
      monthStart: '2026-09-01',
      monthEnd: '2026-09-30',
      entries: [
        expect.objectContaining({
          rank: 1,
          studentId: 'student-1',
          totalSeconds: 900,
          sessionCount: 2,
          isCurrentUser: true,
        }),
      ],
      currentUser: expect.objectContaining({ rank: 1, studentId: 'student-1' }),
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        completedAt: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lt: new Date('2026-10-01T00:00:00.000Z'),
        },
      }),
    }));
  });

  it('keeps top-50 and outside current-user monthly positions deterministic', async () => {
    const topStudents = Array.from({ length: 51 }, (_, index) =>
      session(`student-${String(index + 1).padStart(2, '0')}`, 1000 - index),
    );
    findMany.mockResolvedValue([
      ...topStudents,
      session('student-current', 10),
      session('student-invalid', 999, { status: StudySessionStatus.ABANDONED }),
    ]);

    const result = await service.monthly('student-current');

    expect(result.entries).toHaveLength(50);
    expect(result.currentUser).toMatchObject({
      rank: 52,
      studentId: 'student-current',
      isCurrentUser: true,
    });
    expect(JSON.stringify(result)).not.toContain('finalDurationSeconds');
  });

  it('handles the December to January UTC month boundary', async () => {
    jest.setSystemTime(new Date('2027-01-15T12:00:00.000Z'));
    findMany.mockResolvedValue([
      session('student-1', 600, {
        completedAt: new Date('2027-01-01T00:00:00.000Z'),
      }),
      session('student-2', 600, {
        completedAt: new Date('2026-12-31T23:59:59.000Z'),
      }),
    ]);

    const result = await service.monthly('student-1');

    expect(result.monthStart).toBe('2027-01-01');
    expect(result.monthEnd).toBe('2027-01-31');
    expect(result.entries).toHaveLength(1);
  });

  it('returns an empty monthly leaderboard and unranked current user without valid time', async () => {
    findMany.mockResolvedValue([]);

    await expect(service.monthly('student-1')).resolves.toEqual({
      monthStart: '2026-09-01',
      monthEnd: '2026-09-30',
      entries: [],
      currentUser: null,
    });
  });

  it('uses credited durations for daily, weekly, and monthly ranking while retaining session counts', async () => {
    findMany.mockResolvedValue([
      session('student-capped', 21601, {
        completedAt: new Date('2026-09-11T08:00:00.000Z'),
      }),
      session('student-capped', 21600, {
        completedAt: new Date('2026-09-11T09:00:00.000Z'),
      }),
      session('student-capped', 21600, {
        completedAt: new Date('2026-09-11T10:00:00.000Z'),
      }),
      session('student-capped', 21600, {
        completedAt: new Date('2026-09-11T11:00:00.000Z'),
      }),
      session('student-other', 50000, {
        completedAt: new Date('2026-09-11T08:30:00.000Z'),
      }),
    ]);

    const daily = await service.daily('student-capped');
    const weekly = await service.weekly('student-capped');
    const monthly = await service.monthly('student-capped');

    for (const result of [daily, weekly, monthly]) {
      expect(result.entries[0]).toMatchObject({
        studentId: 'student-capped',
        totalSeconds: 57600,
        sessionCount: 4,
      });
      expect(result.entries[1]).toMatchObject({
        studentId: 'student-other',
        totalSeconds: 21600,
        sessionCount: 1,
      });
    }
  });

  it('resets credit by UTC day for weekly and monthly ranking totals', async () => {
    findMany.mockResolvedValue([
      session('student-1', 21600, {
        completedAt: new Date('2026-09-10T08:00:00.000Z'),
      }),
      session('student-1', 21600, {
        completedAt: new Date('2026-09-10T09:00:00.000Z'),
      }),
      session('student-1', 21600, {
        completedAt: new Date('2026-09-10T10:00:00.000Z'),
      }),
      session('student-1', 21600, {
        completedAt: new Date('2026-09-11T08:00:00.000Z'),
      }),
    ]);

    const weekly = await service.weekly('student-1');
    const monthly = await service.monthly('student-1');

    expect(weekly.entries).toHaveLength(1);
    expect(weekly.entries[0]).toMatchObject({
      totalSeconds: 79200,
      sessionCount: 4,
    });
    expect(monthly.entries).toHaveLength(1);
    expect(monthly.entries[0]).toMatchObject({
      totalSeconds: 79200,
      sessionCount: 4,
    });
  });

  it('uses credited totals before the unchanged session-count and student-id tie breakers', async () => {
    findMany.mockResolvedValue([
      session('student-z', 21600, { completedAt: new Date('2026-09-11T08:00:00.000Z') }),
      session('student-z', 21600, { completedAt: new Date('2026-09-11T09:00:00.000Z') }),
      session('student-z', 21600, { completedAt: new Date('2026-09-11T10:00:00.000Z') }),
      session('student-z', 21600, { completedAt: new Date('2026-09-11T11:00:00.000Z') }),
      session('student-a', 14400, { completedAt: new Date('2026-09-11T08:00:00.000Z') }),
      session('student-a', 14400, { completedAt: new Date('2026-09-11T09:00:00.000Z') }),
      session('student-a', 14400, { completedAt: new Date('2026-09-11T10:00:00.000Z') }),
      session('student-a', 14400, { completedAt: new Date('2026-09-11T11:00:00.000Z') }),
    ]);

    const daily = await service.daily('student-a');

    expect(daily.entries).toMatchObject([
      { rank: 1, studentId: 'student-a', totalSeconds: 57600, sessionCount: 4 },
      { rank: 2, studentId: 'student-z', totalSeconds: 57600, sessionCount: 4 },
    ]);
  });
});
