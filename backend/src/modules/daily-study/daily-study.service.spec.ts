import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DailyStudyModuleStatus,
  Prisma,
  RoleName,
} from '@prisma/client';

import { DailyStudyService } from './daily-study.service';

describe('DailyStudyService', () => {
  type DailyStudyDatabase = {
    user: { findUnique: jest.Mock };
    subject: { findMany: jest.Mock };
    dailyStudyModule: { findUnique: jest.Mock; create: jest.Mock };
    questionPracticeSession: { count: jest.Mock };
    flashcardProgress: { count: jest.Mock };
    videoProgress: { count: jest.Mock };
    testAttempt: { count: jest.Mock };
  };

  let db: DailyStudyDatabase;
  let service: DailyStudyService;

  const student = {
    isActive: true,
    roles: [{ role: { name: RoleName.STUDENT } }],
  };
  const pcbSubjects = [
    { id: 'bio', name: 'Biology', slug: 'biology' },
    { id: 'chem', name: 'Chemistry', slug: 'chemistry' },
    { id: 'phys', name: 'Physics', slug: 'physics' },
  ];

  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn().mockResolvedValue(student) },
      subject: { findMany: jest.fn().mockResolvedValue(pcbSubjects) },
      dailyStudyModule: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      questionPracticeSession: { count: jest.fn().mockResolvedValue(0) },
      flashcardProgress: { count: jest.fn().mockResolvedValue(0) },
      videoProgress: { count: jest.fn().mockResolvedValue(0) },
      testAttempt: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new DailyStudyService(
      db as never,
      { populate: jest.fn() } as never,
      { populate: jest.fn() } as never,
      { populate: jest.fn() } as never,
    );
  });

  it('reuses the canonical module for an existing student/date', async () => {
    const module = { id: 'module-1', tasks: [] };
    db.dailyStudyModule.findUnique.mockResolvedValue(module);

    await expect(
      service.getOrCreateDailyModule('student-1', '2026-09-10'),
    ).resolves.toBe(module);
    expect(db.dailyStudyModule.create).not.toHaveBeenCalled();
  });

  it('creates a new canonical module with a normalized study date', async () => {
    const module = { id: 'module-1', tasks: [] };
    db.dailyStudyModule.create.mockResolvedValue(module);

    await service.getOrCreateDailyModule('student-1', '2026-09-10');

    expect(db.dailyStudyModule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: 'student-1',
          studyDate: new Date('2026-09-10T00:00:00.000Z'),
          status: DailyStudyModuleStatus.NOT_STARTED,
        }),
      }),
    );
  });

  it('recovers an existing module after a concurrent unique-key race', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.19.0',
    });
    const concurrentModule = { id: 'module-race', tasks: [] };
    db.dailyStudyModule.create.mockRejectedValue(conflict);
    db.dailyStudyModule.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrentModule);

    await expect(
      service.getOrCreateDailyModule('student-1', '2026-09-10'),
    ).resolves.toBe(concurrentModule);
  });

  it('rejects missing or non-student users', async () => {
    db.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.getOrCreateDailyModule('missing', '2026-09-10'),
    ).rejects.toBeInstanceOf(NotFoundException);

    db.user.findUnique.mockResolvedValueOnce({
      isActive: true,
      roles: [{ role: { name: RoleName.ADMIN } }],
    });
    await expect(
      service.getOrCreateDailyModule('admin-1', '2026-09-10'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('normalizes an explicit Date to its UTC calendar date', () => {
    expect(service.normalizeStudyDate(new Date('2026-09-10T23:59:00.000Z')))
        .toEqual(new Date('2026-09-10T00:00:00.000Z'));
  });

  it('builds deterministic Physics, Chemistry, and Biology foundation plans', async () => {
    db.subject.findMany.mockResolvedValue([
      { id: 'bio', name: 'Biology', slug: 'biology' },
      { id: 'chem', name: 'Chemistry', slug: 'chemistry' },
      { id: 'phys', name: 'Physics', slug: 'physics' },
    ]);

    const context = await service.buildPersonalizationContext(
      'student-1',
      '2026-09-10',
    );

    expect(context.subjectPlans.map((plan) => plan.subjectId)).toEqual([
      'phys',
      'chem',
      'bio',
    ]);
    expect(context.subjectPlans.every((plan) => plan.desiredQuestionCount === 0))
        .toBe(true);
  });

  it('keeps sparse optional personalization signals safe', async () => {
    db.subject.findMany.mockResolvedValue([
      { id: 'bio', name: 'Biology', slug: 'biology' },
      { id: 'chem', name: 'Chemistry', slug: 'chemistry' },
      { id: 'phys', name: 'Physics', slug: 'physics' },
    ]);

    await expect(
      service.buildPersonalizationContext('student-1', '2026-09-10'),
    ).resolves.toEqual(
      expect.objectContaining({
        recentActivity: {
          questionPracticeSessions: 0,
          flashcardReviews: 0,
          videoProgressEntries: 0,
          formalTestAttempts: 0,
        },
      }),
    );
  });
});
