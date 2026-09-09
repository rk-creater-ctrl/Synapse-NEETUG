import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QuestionPracticeSessionStatus } from '@prisma/client';

import {
  PracticeSessionDatabase,
  PracticeSessionTransaction,
  QuestionPracticeSessionsService,
  StudentQuestionReader,
} from './practice-sessions.service';

describe('QuestionPracticeSessionsService', () => {
  type PrismaMock = PracticeSessionDatabase & {
    questionPracticeSession: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    questionPracticeItem: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    question: { findUnique: jest.Mock };
  };

  type StudentQuestionsMock = jest.Mocked<StudentQuestionReader>;

  let db: PrismaMock;
  let studentQuestions: StudentQuestionsMock;
  let service: QuestionPracticeSessionsService;

  const summarySession = {
    id: 'session-1',
    status: QuestionPracticeSessionStatus.IN_PROGRESS,
    selectedFilters: {},
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [{ isCorrect: null }],
  };

  beforeEach(() => {
    db = {
      $transaction: async <T>(
        callback: (transaction: PracticeSessionTransaction) => PromiseLike<T>,
      ) => await callback(db),
      questionPracticeSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      questionPracticeItem: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      question: { findUnique: jest.fn() },
    };
    studentQuestions = {
      list: jest.fn(),
      get: jest.fn(),
    };
    service = new QuestionPracticeSessionsService(
      db,
      studentQuestions,
    );
  });

  it('selects only questions returned by the existing safe student list', async () => {
    studentQuestions.list.mockResolvedValue({
      items: [{ id: 'question-visible' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    } as never);
    db.questionPracticeSession.create.mockResolvedValue(summarySession as never);

    await service.create('student-1', { questionCount: 20 });

    expect(studentQuestions.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
    expect(db.questionPracticeSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: 'student-1',
          items: { create: [{ questionId: 'question-visible', sequence: 1 }] },
        }),
      }),
    );
  });

  it('does not return another student\'s practice sessions', async () => {
    db.questionPracticeSession.findFirst.mockResolvedValue(null);

    await expect(service.get('student-1', 'other-session')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.questionPracticeSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'other-session', studentId: 'student-1' } }),
    );
  });

  it('withholds answer data until the corresponding item has been answered', async () => {
    const question = {
      id: 'question-1', type: 'SINGLE_CORRECT_MCQ', sourceType: 'CURATED',
      stem: 'What is the SI unit?', explanation: 'The SI unit is metre.', difficulty: 'EASY',
      tags: [], displayOrder: 1,
      exam: { id: 'exam-1', name: 'NEET', slug: 'neet' },
      subject: { id: 'subject-1', name: 'Physics', slug: 'physics' },
      academicClass: { id: 'class-1', name: 'Class 11', slug: 'class-11' },
      chapter: { id: 'chapter-1', name: 'Units', slug: 'units' },
      topic: { id: 'topic-1', name: 'SI', slug: 'si' }, subtopic: null, pyqMetadata: null,
      options: [
        { id: 'option-a', position: 1, text: 'Second', isCorrect: false },
        { id: 'option-b', position: 2, text: 'Metre', isCorrect: true },
      ],
    };
    db.questionPracticeSession.findFirst.mockResolvedValue({
      ...summarySession,
      items: [
        { id: 'item-unanswered', sequence: 1, selectedOptionId: null, isCorrect: null, timeSpentSeconds: null, answeredAt: null, question },
        { id: 'item-answered', sequence: 2, selectedOptionId: 'option-b', isCorrect: true, timeSpentSeconds: 4, answeredAt: new Date(), question },
      ],
    } as never);
    studentQuestions.get.mockResolvedValue({ id: 'question-1' } as never);

    const result = await service.get('student-1', 'session-1');
    const unanswered = result.items[0] as { question: { options: Array<Record<string, unknown>> } };
    const answered = result.items[1] as { answer: { correctOptionId: string; explanation: string } };

    expect(unanswered.question.options[0]).not.toHaveProperty('isCorrect');
    expect(unanswered).not.toHaveProperty('answer');
    expect(answered.answer).toEqual(expect.objectContaining({ correctOptionId: 'option-b', explanation: 'The SI unit is metre.' }));
  });

  it('rejects answers for a completed session', async () => {
    db.questionPracticeSession.findFirst.mockResolvedValue({
      status: QuestionPracticeSessionStatus.COMPLETED,
    } as never);

    await expect(
      service.answer('student-1', 'session-1', 'item-1', { selectedOptionId: 'option-a' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('derives correctness from the stored option and not client input', async () => {
    db.questionPracticeSession.findFirst.mockResolvedValue({
      status: QuestionPracticeSessionStatus.IN_PROGRESS,
    } as never);
    db.questionPracticeItem.findFirst.mockResolvedValue({
      id: 'item-1', questionId: 'question-1', answeredAt: null,
    } as never);
    studentQuestions.get.mockResolvedValue({ id: 'question-1' } as never);
    db.question.findUnique.mockResolvedValue({
      id: 'question-1', explanation: 'Because it is correct.',
      options: [
        { id: 'option-a', isCorrect: false },
        { id: 'option-b', isCorrect: true },
      ],
    } as never);
    db.questionPracticeItem.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await service.answer('student-1', 'session-1', 'item-1', {
      selectedOptionId: 'option-b',
      timeSpentSeconds: 12,
    });

    expect(result).toEqual(expect.objectContaining({ isCorrect: true, correctOptionId: 'option-b' }));
    expect(db.questionPracticeItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isCorrect: true, selectedOptionId: 'option-b' }),
      }),
    );
  });

  it('rejects an option from another question', async () => {
    db.questionPracticeSession.findFirst.mockResolvedValue({
      status: QuestionPracticeSessionStatus.IN_PROGRESS,
    } as never);
    db.questionPracticeItem.findFirst.mockResolvedValue({
      id: 'item-1', questionId: 'question-1', answeredAt: null,
    } as never);
    studentQuestions.get.mockResolvedValue({ id: 'question-1' } as never);
    db.question.findUnique.mockResolvedValue({
      id: 'question-1', explanation: 'Explanation', options: [{ id: 'option-a', isCorrect: true }],
    } as never);

    await expect(
      service.answer('student-1', 'session-1', 'item-1', { selectedOptionId: 'other-question-option' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses a conditional update to prevent duplicate answer races', async () => {
    db.questionPracticeSession.findFirst.mockResolvedValue({
      status: QuestionPracticeSessionStatus.IN_PROGRESS,
    } as never);
    db.questionPracticeItem.findFirst.mockResolvedValue({
      id: 'item-1', questionId: 'question-1', answeredAt: null,
    } as never);
    studentQuestions.get.mockResolvedValue({ id: 'question-1' } as never);
    db.question.findUnique.mockResolvedValue({
      id: 'question-1', explanation: 'Explanation', options: [{ id: 'option-a', isCorrect: true }],
    } as never);
    db.questionPracticeItem.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      service.answer('student-1', 'session-1', 'item-1', { selectedOptionId: 'option-a' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.questionPracticeItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ answeredAt: null }) }),
    );
  });

  it('completes atomically and returns an answered-only accuracy summary', async () => {
    db.questionPracticeSession.findFirst.mockResolvedValue({
      status: QuestionPracticeSessionStatus.IN_PROGRESS,
    } as never);
    db.questionPracticeSession.updateMany.mockResolvedValue({ count: 1 } as never);
    db.questionPracticeItem.findMany.mockResolvedValue([
      { isCorrect: true }, { isCorrect: false }, { isCorrect: null },
    ] as never);

    const result = await service.complete('student-1', 'session-1');

    expect(result.summary).toEqual({
      totalQuestions: 3,
      answeredQuestions: 2,
      correctAnswers: 1,
      incorrectAnswers: 1,
      unansweredQuestions: 1,
      accuracyPercentage: 50,
    });
  });

  it('rejects a second completion through its conditional status update', async () => {
    db.questionPracticeSession.findFirst.mockResolvedValue({
      status: QuestionPracticeSessionStatus.IN_PROGRESS,
    } as never);
    db.questionPracticeSession.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(service.complete('student-1', 'session-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
