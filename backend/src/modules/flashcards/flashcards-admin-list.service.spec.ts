import {
  AdminFlashcardListDto,
  UpdateFlashcardDto,
} from './flashcards.dto';
import { FlashcardsService } from './flashcards.service';

describe('FlashcardsService admin list', () => {
  const db = {
    $transaction: jest.fn(),
    flashcard: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const hierarchy = { validate: jest.fn() };
  const mediaAssets = { assertActiveForAssignment: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    db.flashcard.findMany.mockResolvedValue([{ id: 'flashcard-1' }]);
    db.flashcard.count.mockResolvedValue(1);
  });

  it('returns the shared list contract and maps class/premium filters', async () => {
    const service = new FlashcardsService(db as never, hierarchy as never, mediaAssets as never);
    const query = Object.assign(new AdminFlashcardListDto(), {
      page: 1,
      limit: 20,
      classId: 'class-1',
      isPublished: true,
      isActive: true,
      isPremium: true,
      search: 'dimension',
    });

    await expect(service.adminList(query)).resolves.toEqual({
      items: [{ id: 'flashcard-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(db.flashcard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicClassId: 'class-1',
          isPublished: true,
          isActive: true,
          isPremium: true,
        }),
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('validates the effective hierarchy before a partial update', async () => {
    const service = new FlashcardsService(db as never, hierarchy as never, mediaAssets as never);
    db.flashcard.findUnique.mockResolvedValue({
      id: 'flashcard-1',
      examId: 'exam-1',
      subjectId: 'subject-1',
      academicClassId: 'class-1',
      chapterId: 'chapter-1',
      topicId: 'topic-1',
      subtopicId: null,
    });
    db.flashcard.update.mockResolvedValue({ id: 'flashcard-1' });
    hierarchy.validate.mockResolvedValue(undefined);

    await service.update(
      'flashcard-1',
      Object.assign(new UpdateFlashcardDto(), { title: 'Updated title' }),
    );

    expect(hierarchy.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        subjectId: 'subject-1',
        academicClassId: 'class-1',
        chapterId: 'chapter-1',
        topicId: 'topic-1',
      }),
    );
  });
});
