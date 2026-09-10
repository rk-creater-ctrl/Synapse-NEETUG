import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { TestAttemptStatus } from '@prisma/client';
import { PrismaService as DatabasePrismaService } from '../../core/database/prisma.service';
import { StudentTestsService } from './student-tests.service';
import { TestAttemptsService } from './test-attempts.service';

describe('TestAttemptsService', () => {
  const futureDeadline = new Date(Date.now() + 60_000);

  const inProgressAttempt = () => ({
    id: 'attempt-1',
    studentId: 'student-1',
    testId: 'test-1',
    status: TestAttemptStatus.IN_PROGRESS,
    startedAt: new Date(),
    deadlineAt: futureDeadline,
    submittedAt: null,
    autoSubmittedAt: null,
    score: null,
    correctCount: null,
    incorrectCount: null,
    unansweredCount: null,
    test: {
      id: 'test-1',
      title: 'Physics test',
      description: null,
      instructions: null,
      durationMinutes: 60,
      totalMarks: 4,
      availableFrom: null,
      availableUntil: null,
      sections: [
        {
          id: 'section-1',
          title: 'Physics',
          instructions: null,
          displayOrder: 1,
          questions: [
            {
              id: 'test-question-1',
              displayOrder: 1,
              marks: 4,
              negativeMarks: 1,
              question: {
                id: 'question-1',
                stem: 'Safe attempt question',
                options: [
                  { id: 'option-1', position: 1, text: 'A', isCorrect: true },
                  { id: 'option-2', position: 2, text: 'B', isCorrect: false },
                ],
              },
            },
          ],
        },
      ],
    },
    answers: [
      {
        testQuestionId: 'test-question-1',
        selectedOptionId: null,
        isMarkedForReview: false,
        answeredAt: null,
      },
    ],
  });

  const createService = (
    dbMock: Record<string, unknown>,
    visibleTest: { id: string; durationMinutes: number; totalMarks: number } = {
      id: 'test-1',
      durationMinutes: 60,
      totalMarks: 4,
    },
  ) => {
    const studentTests = {
      findVisibleForAttempt: jest.fn(async () => visibleTest),
    };
    return {
      studentTests,
      service: new TestAttemptsService(
        dbMock as unknown as DatabasePrismaService,
        studentTests as unknown as StudentTestsService,
      ),
    };
  };

  it('starts a visible test and initializes server-owned attempt timing', async () => {
    const createdAttempt = {
      id: 'attempt-1',
      testId: 'test-1',
      status: TestAttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      deadlineAt: futureDeadline,
    };
    const tx = {
      testQuestion: { findMany: jest.fn(async () => [{ id: 'test-question-1' }]) },
      testAttempt: { create: jest.fn(async () => createdAttempt) },
    };
    const dbMock = {
      testAttempt: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const { service } = createService(dbMock);

    await expect(service.start('student-1', 'test-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'attempt-1',
        status: TestAttemptStatus.IN_PROGRESS,
      }),
    );
  });

  it('resumes an existing valid in-progress attempt', async () => {
    const existing = {
      id: 'attempt-1',
      testId: 'test-1',
      status: TestAttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      deadlineAt: futureDeadline,
    };
    const dbMock = {
      testAttempt: { findFirst: jest.fn(async () => existing) },
    };
    const { service } = createService(dbMock);

    await expect(service.start('student-1', 'test-1')).resolves.toEqual(
      expect.objectContaining({ id: 'attempt-1' }),
    );
  });

  it('does not start a test that fails the shared student visibility gate', async () => {
    const studentTests = {
      findVisibleForAttempt: jest.fn(async () => {
        throw new NotFoundException();
      }),
    };
    const dbMock = {
      testAttempt: { findFirst: jest.fn(async () => null) },
    };
    const service = new TestAttemptsService(
      dbMock as unknown as DatabasePrismaService,
      studentTests as unknown as StudentTestsService,
    );

    await expect(service.start('student-1', 'locked-test')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('owner-scopes attempt reads', async () => {
    const dbMock = {
      testAttempt: { findFirst: jest.fn(async () => null) },
    };
    const { service } = createService(dbMock);

    await expect(service.findOne('student-2', 'attempt-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns attempt questions and options without correct-option flags', async () => {
    const dbMock = {
      testAttempt: { findFirst: jest.fn(async () => inProgressAttempt()) },
    };
    const { service } = createService(dbMock);

    const attempt = await service.findOne('student-1', 'attempt-1');

    expect(JSON.stringify(attempt)).toContain('Safe attempt question');
    expect(JSON.stringify(attempt)).not.toContain('isCorrect');
  });

  it('rejects an option that does not belong to the attempt question', async () => {
    const tx = {
      testAttempt: { findFirst: jest.fn(async () => inProgressAttempt()) },
      testQuestion: {
        findFirst: jest.fn(async () => ({
          id: 'test-question-1',
          questionId: 'question-1',
        })),
      },
      questionOption: { findFirst: jest.fn(async () => null) },
    };
    const dbMock = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const { service } = createService(dbMock);

    await expect(
      service.saveAnswer('student-1', 'attempt-1', 'test-question-1', {
        selectedOptionId: 'foreign-option',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses server-side answer keys and stored negative marks during scoring', async () => {
    const finalized = {
      id: 'attempt-1',
      status: TestAttemptStatus.SUBMITTED,
      submittedAt: new Date(),
      autoSubmittedAt: null,
      score: -1,
      correctCount: 0,
      incorrectCount: 1,
      unansweredCount: 0,
    };
    const tx = {
      testAttempt: {
        findFirst: jest.fn(async () => inProgressAttempt()),
        update: jest.fn(async () => finalized),
      },
      testQuestion: {
        findMany: jest.fn(async () => [
          {
            id: 'test-question-1',
            marks: 4,
            negativeMarks: 1,
            question: {
              options: [
                { id: 'option-1', isCorrect: true },
                { id: 'option-2', isCorrect: false },
              ],
            },
          },
        ]),
      },
      testAttemptAnswer: {
        findMany: jest.fn(async () => [
          {
            id: 'answer-1',
            testQuestionId: 'test-question-1',
            selectedOptionId: 'option-2',
          },
        ]),
        update: jest.fn(async () => ({})),
        create: jest.fn(async () => ({})),
      },
    };
    const dbMock = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const { service } = createService(dbMock);

    const summary = await service.submit('student-1', 'attempt-1');

    expect(summary).toEqual(expect.objectContaining({ score: -1 }));
    expect(tx.testAttemptAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isCorrect: false, awardedMarks: -1 }),
      }),
    );
  });
});
