import { DailyStudyTaskType } from '@prisma/client';

import {
  physicsDailyTargets,
  PhysicsDailyStudyStrategy,
} from './physics-daily-study.strategy';

describe('PhysicsDailyStudyStrategy', () => {
  const physics = { id: 'physics-id', name: 'Physics', slug: 'physics' };

  const createDatabase = () => ({
    dailyStudyModule: { findFirst: jest.fn().mockResolvedValue({ id: 'module-1', tasks: [] }) },
    question: { findMany: jest.fn().mockResolvedValue([]) },
    flashcard: { findMany: jest.fn().mockResolvedValue([]) },
    revisionItem: { findMany: jest.fn().mockResolvedValue([]) },
    video: { findMany: jest.fn().mockResolvedValue([]) },
    questionPracticeItem: { findMany: jest.fn().mockResolvedValue([]) },
    testAttemptAnswer: { findMany: jest.fn().mockResolvedValue([]) },
    dailyStudyTask: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  });

  it('uses only the resolved Physics subject and free visible content filters', async () => {
    const db = createDatabase();
    const service = new PhysicsDailyStudyStrategy({
      ...db,
      $transaction: async (callback: (tx: typeof db) => Promise<unknown>) =>
        callback(db),
    } as never);

    await service.populate('student-1', 'module-1', physics);

    expect(db.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subjectId: 'physics-id',
          isActive: true,
          isPublished: true,
          isFree: true,
        }),
      }),
    );
    expect(db.flashcard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subjectId: 'physics-id',
          isPremium: false,
        }),
      }),
    );
  });

  it('returns no tasks safely when Physics content is sparse', async () => {
    const db = createDatabase();
    const service = new PhysicsDailyStudyStrategy({
      ...db,
      $transaction: async (callback: (tx: typeof db) => Promise<unknown>) =>
        callback(db),
    } as never);

    await expect(service.populate('student-1', 'module-1', physics)).resolves.toEqual([]);
    expect(db.dailyStudyTask.createMany).not.toHaveBeenCalled();
  });

  it('persists derived Physics task references with matching task types', async () => {
    const db = createDatabase();
    db.question.findMany.mockResolvedValue([
      {
        id: 'physics-question',
        chapterId: 'chapter-1',
        topicId: 'topic-1',
        subtopicId: null,
        difficulty: 'MEDIUM',
        sourceType: 'PYQ',
      },
    ]);
    const service = new PhysicsDailyStudyStrategy({
      ...db,
      $transaction: async (callback: (tx: typeof db) => Promise<unknown>) =>
        callback(db),
    } as never);

    await service.populate('student-1', 'module-1', physics);

    expect(db.dailyStudyTask.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            subjectId: 'physics-id',
            type: DailyStudyTaskType.QUESTION,
            questionId: 'physics-question',
            flashcardId: null,
            revisionItemId: null,
            videoId: null,
            chapterId: 'chapter-1',
            topicId: 'topic-1',
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it('keeps configured task maxima centralized', () => {
    expect(physicsDailyTargets).toEqual({
      questions: 10,
      flashcards: 5,
      revisionItems: 2,
      videos: 1,
    });
  });
});
