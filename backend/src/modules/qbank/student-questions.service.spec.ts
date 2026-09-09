import { NotFoundException } from '@nestjs/common';
import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { StudentQuestionsService } from './student-questions.service';

function createDb() {
  return {
    $transaction: jest.fn(),
    question: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

describe('StudentQuestionsService', () => {
  let db: ReturnType<typeof createDb>;
  let service: StudentQuestionsService;

  beforeEach(() => {
    db = createDb();
    service = new StudentQuestionsService(db as never);
    db.$transaction.mockImplementation((input: Promise<unknown>[]) => Promise.all(input));
    db.question.findMany.mockResolvedValue([]);
    db.question.count.mockResolvedValue(0);
  });

  it('returns only safe pre-answer fields in the normalized student list contract', async () => {
    db.question.findMany.mockResolvedValue([{
      id: 'question-1',
      stem: 'What is force?',
      options: [{ id: 'option-1', position: 1, text: 'Mass × acceleration' }],
    }]);
    db.question.count.mockResolvedValue(1);

    const result = await service.list({ page: 1, limit: 20 });
    const request = db.question.findMany.mock.calls[0][0];

    expect(result).toEqual({
      items: [{
        id: 'question-1',
        stem: 'What is force?',
        options: [{ id: 'option-1', position: 1, text: 'Mass × acceleration' }],
      }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(request.select).not.toHaveProperty('explanation');
    expect(request.select).not.toHaveProperty('solutionVideo');
    expect(request.select.options.select).toEqual({ id: true, position: true, text: true });
    expect(request.select.options.select).not.toHaveProperty('isCorrect');
  });

  it('enforces active, published, free questions and active/published ancestors', async () => {
    await service.list({ page: 1, limit: 20, topicId: 'topic-1' });
    const where = db.question.findMany.mock.calls[0][0].where;

    expect(where).toEqual(expect.objectContaining({
      isActive: true,
      isPublished: true,
      isFree: true,
      topicId: 'topic-1',
      AND: expect.any(Array),
    }));
    expect(where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({ exam: expect.any(Object) }),
      expect.objectContaining({ chapter: expect.any(Object) }),
      expect.objectContaining({ topic: expect.any(Object) }),
      expect.objectContaining({ OR: expect.arrayContaining([{ subtopicId: null }]) }),
    ]));
  });

  it('applies PYQ, year, difficulty, tag, hierarchy, and pagination filters without weakening visibility', async () => {
    await service.list({
      page: 2,
      limit: 10,
      classId: 'class-11',
      pyqOnly: true,
      pyqYear: 2024,
      difficulty: QuestionDifficulty.HARD,
      tag: ' mechanics ',
    });
    const request = db.question.findMany.mock.calls[0][0];

    expect(request).toEqual(expect.objectContaining({ skip: 10, take: 10 }));
    expect(request.where).toEqual(expect.objectContaining({
      isActive: true,
      isPublished: true,
      isFree: true,
      academicClassId: 'class-11',
      sourceType: QuestionSourceType.PYQ,
      difficulty: QuestionDifficulty.HARD,
      tags: { has: 'mechanics' },
      pyqMetadata: { is: { year: 2024 } },
    }));
  });

  it('uses the same hidden-content rules for direct ID access', async () => {
    db.question.findFirst.mockResolvedValue(null);

    await expect(service.get('premium-or-hidden-question')).rejects.toBeInstanceOf(NotFoundException);

    const request = db.question.findFirst.mock.calls[0][0];
    expect(request.where).toEqual(expect.objectContaining({
      id: 'premium-or-hidden-question',
      isActive: true,
      isPublished: true,
      isFree: true,
      AND: expect.any(Array),
    }));
    expect(request.select).not.toHaveProperty('explanation');
    expect(request.select.options.select).not.toHaveProperty('isCorrect');
  });

  it('supports nullable subtopics while retaining hidden-ancestor protection', async () => {
    await service.list({ page: 1, limit: 20, subtopicId: 'subtopic-1' });
    const where = db.question.findMany.mock.calls[0][0].where;

    expect(where.subtopicId).toBe('subtopic-1');
    expect(where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({ OR: expect.arrayContaining([
        { subtopicId: null },
        expect.objectContaining({ subtopic: expect.any(Object) }),
      ]) }),
    ]));
  });
});
