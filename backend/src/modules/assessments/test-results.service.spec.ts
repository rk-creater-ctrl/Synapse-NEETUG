import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TestAttemptStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { TestResultsService } from './test-results.service';

describe('TestResultsService', () => {
  const finalizedResultAttempt = (
    status:
      | typeof TestAttemptStatus.SUBMITTED
      | typeof TestAttemptStatus.AUTO_SUBMITTED = TestAttemptStatus.SUBMITTED,
  ) => ({
    id: 'attempt-1',
    testId: 'test-1',
    status,
    startedAt: new Date('2026-09-09T10:00:00.000Z'),
    deadlineAt: new Date('2026-09-09T11:00:00.000Z'),
    submittedAt: new Date('2026-09-09T10:30:00.000Z'),
    autoSubmittedAt: null,
    score: 3,
    correctCount: 1,
    incorrectCount: 1,
    unansweredCount: 0,
    test: {
      title: 'Physics test',
      totalMarks: 8,
      sections: [{ _count: { questions: 2 } }],
    },
    internalValue: 'must not leak',
  });

  const createService = (findFirst: ReturnType<typeof jest.fn>) => {
    const dbMock = {
      testAttempt: { findFirst },
    };
    return new TestResultsService(dbMock as unknown as PrismaService);
  };

  it('returns persisted finalized result data for the owner', async () => {
    const service = createService(jest.fn(async () => finalizedResultAttempt()));

    const result = await service.result('student-1', 'attempt-1');

    expect(result).toEqual(
      expect.objectContaining({
        attemptId: 'attempt-1',
        score: 3,
        totalMarks: 8,
        totalQuestionCount: 2,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('internalValue');
  });

  it('allows AUTO_SUBMITTED attempts to expose their persisted summary', async () => {
    const service = createService(
      jest.fn(async () => finalizedResultAttempt(TestAttemptStatus.AUTO_SUBMITTED)),
    );

    await expect(service.result('student-1', 'attempt-1')).resolves.toEqual(
      expect.objectContaining({ status: TestAttemptStatus.AUTO_SUBMITTED }),
    );
  });

  it('denies result access while an attempt is in progress', async () => {
    const service = createService(
      jest.fn(async () => ({
        ...finalizedResultAttempt(),
        status: TestAttemptStatus.IN_PROGRESS,
      })),
    );

    await expect(service.result('student-1', 'attempt-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('owner-scopes result and review lookups', async () => {
    const service = createService(jest.fn(async () => null));

    await expect(service.result('other-student', 'attempt-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.review('other-student', 'attempt-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns finalized review data through explicit safe allowlists', async () => {
    const service = createService(
      jest.fn(async () => ({
        id: 'attempt-1',
        testId: 'test-1',
        status: TestAttemptStatus.SUBMITTED,
        test: {
          id: 'test-1',
          title: 'Physics test',
          sections: [
            {
              id: 'section-1',
              title: 'Physics',
              instructions: null,
              displayOrder: 1,
              unexpectedSectionField: 'must not leak',
              questions: [
                {
                  id: 'test-question-1',
                  questionId: 'question-1',
                  displayOrder: 1,
                  marks: 4,
                  negativeMarks: 1,
                  unexpectedQuestionField: 'must not leak',
                  question: {
                    stem: 'What is SI unit?',
                    explanation: 'The SI base unit is defined by convention.',
                    mediaAsset: { externalKey: 'private-key' },
                    options: [
                      {
                        id: 'option-1',
                        position: 1,
                        text: 'metre',
                        isCorrect: true,
                        privateValue: 'must not leak',
                      },
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
            selectedOptionId: 'option-1',
            isMarkedForReview: false,
            answeredAt: new Date(),
            isCorrect: true,
            awardedMarks: 4,
          },
        ],
      })),
    );

    const review = await service.review('student-1', 'attempt-1');
    const encoded = JSON.stringify(review);

    expect(encoded).toContain('What is SI unit?');
    expect(encoded).toContain('isCorrect');
    expect(encoded).not.toContain('private-key');
    expect(encoded).not.toContain('unexpectedSectionField');
    expect(encoded).not.toContain('unexpectedQuestionField');
    expect(encoded).not.toContain('privateValue');
  });
});
