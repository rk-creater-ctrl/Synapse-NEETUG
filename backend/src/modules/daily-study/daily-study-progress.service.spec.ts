import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DailyStudyModuleStatus,
  DailyStudyTaskStatus,
} from '@prisma/client';

import { DailyStudyService } from './daily-study.service';

describe('DailyStudyService Phase 8G progress lifecycle', () => {
  const originalStartedAt = new Date('2026-09-10T09:00:00.000Z');
  type ProgressDatabase = {
    dailyStudyTask: {
      findFirst: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    dailyStudyModule: {
      findUnique: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
    question: { findMany: jest.Mock };
    flashcard: { findMany: jest.Mock };
    revisionItem: { findMany: jest.Mock };
    video: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const createService = (
    task: {
      status: DailyStudyTaskStatus;
      startedAt: Date | null;
      completedAt: Date | null;
    },
    allStatuses: DailyStudyTaskStatus[] = [task.status],
  ) => {
    const db = {} as ProgressDatabase;
    db.dailyStudyTask = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'task-1',
        moduleId: 'module-1',
        ...task,
      }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(
        allStatuses.map((status) => ({ status })),
      ),
    };
    db.dailyStudyModule = {
      findUnique: jest.fn().mockResolvedValue({
        startedAt: null,
        completedAt: null,
      }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({
        id: 'module-1',
        studyDate: new Date('2026-09-10T00:00:00.000Z'),
        status: DailyStudyModuleStatus.NOT_STARTED,
        generatedAt: new Date(),
        startedAt: null,
        completedAt: null,
        tasks: [],
      }),
    };
    db.question = { findMany: jest.fn().mockResolvedValue([]) };
    db.flashcard = { findMany: jest.fn().mockResolvedValue([]) };
    db.revisionItem = { findMany: jest.fn().mockResolvedValue([]) };
    db.video = { findMany: jest.fn().mockResolvedValue([]) };
    db.$transaction = jest.fn(
      async (callback: (tx: ProgressDatabase) => Promise<unknown>) =>
        callback(db),
    );
    const physics = { populate: jest.fn() };
    const chemistry = { populate: jest.fn() };
    const biology = { populate: jest.fn() };
    return {
      db,
      physics,
      chemistry,
      biology,
      service: new DailyStudyService(
        db as never,
        physics as never,
        chemistry as never,
        biology as never,
      ),
    };
  };

  it('moves pending work to in progress with a server-owned start timestamp', async () => {
    const { db, service } = createService({
      status: DailyStudyTaskStatus.PENDING,
      startedAt: null,
      completedAt: null,
    }, [DailyStudyTaskStatus.IN_PROGRESS, DailyStudyTaskStatus.PENDING]);

    await service.updateTaskStatus(
      'student-1',
      'task-1',
      DailyStudyTaskStatus.IN_PROGRESS,
    );

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.dailyStudyTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DailyStudyTaskStatus.IN_PROGRESS,
          startedAt: expect.any(Date),
          completedAt: null,
        }),
      }),
    );
    expect(db.dailyStudyModule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DailyStudyModuleStatus.IN_PROGRESS,
          startedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('sets completion timestamps for direct completion and preserves an existing start', async () => {
    const { db, service } = createService({
      status: DailyStudyTaskStatus.IN_PROGRESS,
      startedAt: originalStartedAt,
      completedAt: null,
    }, [DailyStudyTaskStatus.COMPLETED]);

    await service.updateTaskStatus(
      'student-1',
      'task-1',
      DailyStudyTaskStatus.COMPLETED,
    );

    expect(db.dailyStudyTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DailyStudyTaskStatus.COMPLETED,
          startedAt: originalStartedAt,
          completedAt: expect.any(Date),
        }),
      }),
    );
    expect(db.dailyStudyModule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DailyStudyModuleStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('keeps skipped work without a completion timestamp', async () => {
    const { db, service } = createService({
      status: DailyStudyTaskStatus.PENDING,
      startedAt: null,
      completedAt: null,
    }, [DailyStudyTaskStatus.SKIPPED]);

    await service.updateTaskStatus(
      'student-1',
      'task-1',
      DailyStudyTaskStatus.SKIPPED,
    );

    expect(db.dailyStudyTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DailyStudyTaskStatus.SKIPPED,
          startedAt: null,
          completedAt: null,
        }),
      }),
    );
  });

  it('rejects pending resets and terminal-state transitions', async () => {
    const { service } = createService({
      status: DailyStudyTaskStatus.COMPLETED,
      startedAt: originalStartedAt,
      completedAt: new Date(),
    });
    await expect(
      service.updateTaskStatus('student-1', 'task-1', DailyStudyTaskStatus.PENDING),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateTaskStatus('student-1', 'task-1', DailyStudyTaskStatus.SKIPPED),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('is idempotent for the same state without replacing timestamps', async () => {
    const { db, service } = createService({
      status: DailyStudyTaskStatus.COMPLETED,
      startedAt: originalStartedAt,
      completedAt: new Date(),
    });

    await service.updateTaskStatus(
      'student-1',
      'task-1',
      DailyStudyTaskStatus.COMPLETED,
    );

    expect(db.dailyStudyTask.update).not.toHaveBeenCalled();
  });

  it('does not reveal or mutate another student task', async () => {
    const { db, service } = createService({
      status: DailyStudyTaskStatus.PENDING,
      startedAt: null,
      completedAt: null,
    });
    db.dailyStudyTask.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTaskStatus('student-1', 'other-task', DailyStudyTaskStatus.SKIPPED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.dailyStudyTask.update).not.toHaveBeenCalled();
  });

  it('does not invoke subject generation while updating progress', async () => {
    const { physics, chemistry, biology, service } = createService({
      status: DailyStudyTaskStatus.PENDING,
      startedAt: null,
      completedAt: null,
    });

    await service.updateTaskStatus(
      'student-1',
      'task-1',
      DailyStudyTaskStatus.SKIPPED,
    );

    expect(physics.populate).not.toHaveBeenCalled();
    expect(chemistry.populate).not.toHaveBeenCalled();
    expect(biology.populate).not.toHaveBeenCalled();
  });

  it('calculates the direct overall summary for mixed task states', () => {
    const { service } = createService({
      status: DailyStudyTaskStatus.PENDING,
      startedAt: null,
      completedAt: null,
    });
    const summary = service['progressSummary']([
      { status: DailyStudyTaskStatus.PENDING },
      { status: DailyStudyTaskStatus.IN_PROGRESS },
      { status: DailyStudyTaskStatus.COMPLETED },
      { status: DailyStudyTaskStatus.SKIPPED },
    ]).overall;

    expect(summary).toEqual({
      totalTasks: 4,
      pendingTasks: 1,
      inProgressTasks: 1,
      completedTasks: 1,
      skippedTasks: 1,
      finishedTasks: 2,
      completionPercent: 50,
    });
  });

  it('calculates terminal and zero-task completion percentages directly', () => {
    const { service } = createService({
      status: DailyStudyTaskStatus.PENDING,
      startedAt: null,
      completedAt: null,
    });

    expect(
      service['progressSummary']([
        { status: DailyStudyTaskStatus.COMPLETED },
        { status: DailyStudyTaskStatus.SKIPPED },
      ]).overall.completionPercent,
    ).toBe(100);
    expect(service['progressSummary']([]).overall).toEqual({
      totalTasks: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      completedTasks: 0,
      skippedTasks: 0,
      finishedTasks: 0,
      completionPercent: 0,
    });
  });

  it('keeps Physics, Chemistry, and Biology summaries independently scoped', () => {
    const { service } = createService({
      status: DailyStudyTaskStatus.PENDING,
      startedAt: null,
      completedAt: null,
    });
    const subjects = [
      {
        slug: 'physics',
        tasks: [
          { status: DailyStudyTaskStatus.COMPLETED },
          { status: DailyStudyTaskStatus.PENDING },
        ],
      },
      {
        slug: 'chemistry',
        tasks: [
          { status: DailyStudyTaskStatus.COMPLETED },
          { status: DailyStudyTaskStatus.SKIPPED },
        ],
      },
      {
        slug: 'biology',
        tasks: [{ status: DailyStudyTaskStatus.IN_PROGRESS }],
      },
      { slug: 'empty', tasks: [] },
    ];
    const summaries = subjects.map((subject) => ({
      slug: subject.slug,
      progress: service['progressSummary'](subject.tasks).overall,
    }));

    expect(summaries).toEqual([
      expect.objectContaining({
        slug: 'physics',
        progress: expect.objectContaining({
          totalTasks: 2,
          finishedTasks: 1,
          completionPercent: 50,
        }),
      }),
      expect.objectContaining({
        slug: 'chemistry',
        progress: expect.objectContaining({
          totalTasks: 2,
          finishedTasks: 2,
          completionPercent: 100,
        }),
      }),
      expect.objectContaining({
        slug: 'biology',
        progress: expect.objectContaining({
          totalTasks: 1,
          finishedTasks: 0,
          completionPercent: 0,
        }),
      }),
      expect.objectContaining({
        slug: 'empty',
        progress: expect.objectContaining({
          totalTasks: 0,
          finishedTasks: 0,
          completionPercent: 0,
        }),
      }),
    ]);
  });
});
