import { DailyStudyTaskType } from '@prisma/client';

import {
  BiologyDailyStudyStrategy,
  biologyDailyTargets,
} from './biology-daily-study.strategy';

describe('BiologyDailyStudyStrategy', () => {
  const biology = { id: 'biology-id', name: 'Biology', slug: 'biology' };

  const database = () => ({
    dailyStudyModule: { findFirst: jest.fn().mockResolvedValue({ id: 'module-1', tasks: [] }) },
    question: { findMany: jest.fn().mockResolvedValue([]) },
    flashcard: { findMany: jest.fn().mockResolvedValue([]) },
    revisionItem: { findMany: jest.fn().mockResolvedValue([]) },
    video: { findMany: jest.fn().mockResolvedValue([]) },
    questionPracticeItem: { findMany: jest.fn().mockResolvedValue([]) },
    testAttemptAnswer: { findMany: jest.fn().mockResolvedValue([]) },
    dailyStudyTask: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  });

  it('uses only active, published, eligible Biology content', async () => {
    const db = database();
    const strategy = new BiologyDailyStudyStrategy({
      ...db,
      $transaction: async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
    } as never);

    await strategy.populate('student-1', 'module-1', biology);

    expect(db.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subjectId: 'biology-id',
          isActive: true,
          isPublished: true,
          isFree: true,
        }),
      }),
    );
    expect(db.flashcard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subjectId: 'biology-id',
          isPremium: false,
        }),
      }),
    );
  });

  it('persists Biology fact revision with a matching reference only', async () => {
    const db = database();
    db.revisionItem.findMany.mockResolvedValue([
      {
        id: 'biology-fact',
        chapterId: 'chapter-1',
        topicId: 'topic-1',
        subtopicId: null,
        type: 'BIOLOGY_FACT',
      },
    ]);
    const strategy = new BiologyDailyStudyStrategy({
      ...db,
      $transaction: async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
    } as never);

    await strategy.populate('student-1', 'module-1', biology);

    expect(db.dailyStudyTask.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            subjectId: 'biology-id',
            type: DailyStudyTaskType.REVISION,
            revisionItemId: 'biology-fact',
            questionId: null,
            flashcardId: null,
            videoId: null,
            chapterId: 'chapter-1',
            topicId: 'topic-1',
          }),
        ],
      }),
    );
  });

  it('centralizes Biology recall-oriented maxima', () => {
    expect(biologyDailyTargets).toEqual({
      questions: 10,
      flashcards: 8,
      revisionItems: 4,
      videos: 1,
    });
  });
});
