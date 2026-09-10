import { DailyStudyTaskType } from '@prisma/client';

import {
  ChemistryDailyStudyStrategy,
  chemistryDailyTargets,
} from './chemistry-daily-study.strategy';

describe('ChemistryDailyStudyStrategy', () => {
  const chemistry = { id: 'chemistry-id', name: 'Chemistry', slug: 'chemistry' };

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

  it('uses only active, published, free Chemistry content', async () => {
    const db = database();
    const strategy = new ChemistryDailyStudyStrategy({
      ...db,
      $transaction: async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
    } as never);

    await strategy.populate('student-1', 'module-1', chemistry);

    expect(db.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subjectId: 'chemistry-id',
          isActive: true,
          isPublished: true,
          isFree: true,
        }),
      }),
    );
    expect(db.flashcard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subjectId: 'chemistry-id',
          isPremium: false,
        }),
      }),
    );
  });

  it('persists Chemistry revision tasks with derived hierarchy only', async () => {
    const db = database();
    db.revisionItem.findMany.mockResolvedValue([
      { id: 'revision-1', chapterId: 'chapter-1', topicId: 'topic-1', subtopicId: null },
    ]);
    const strategy = new ChemistryDailyStudyStrategy({
      ...db,
      $transaction: async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
    } as never);

    await strategy.populate('student-1', 'module-1', chemistry);

    expect(db.dailyStudyTask.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            subjectId: 'chemistry-id',
            type: DailyStudyTaskType.REVISION,
            revisionItemId: 'revision-1',
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

  it('keeps Chemistry revision emphasis and sparse-content behavior deterministic', async () => {
    expect(chemistryDailyTargets).toEqual({
      questions: 10,
      flashcards: 5,
      revisionItems: 3,
      videos: 1,
    });
  });
});
