import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TestAttemptStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { SaveTestAttemptAnswerDto } from './test-attempts.dto';
import { StudentTestsService } from './student-tests.service';

type FinalizationResult = {
  id: string;
  status: TestAttemptStatus;
  submittedAt: Date | null;
  autoSubmittedAt: Date | null;
  score: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  unansweredCount: number | null;
};

@Injectable()
export class TestAttemptsService {
  constructor(
    private readonly db: PrismaService,
    private readonly studentTests: StudentTestsService,
  ) {}

  async start(studentId: string, testId: string) {
    const existing = await this.db.testAttempt.findFirst({
      where: { studentId, testId },
      orderBy: { startedAt: 'desc' },
    });

    if (existing) {
      if (
        existing.status === TestAttemptStatus.IN_PROGRESS &&
        existing.deadlineAt > new Date()
      ) {
        return this.safeAttemptStart(existing);
      }

      if (existing.status === TestAttemptStatus.IN_PROGRESS) {
        await this.finalizeById(
          studentId,
          existing.id,
          TestAttemptStatus.AUTO_SUBMITTED,
        );
      }

      throw new ConflictException({
        code: 'TEST_RETAKE_NOT_AVAILABLE',
        message:
          'This test already has a finalized attempt and cannot be started again.',
      });
    }

    const visibleTest = await this.studentTests.findVisibleForAttempt(testId);
    const startedAt = new Date();
    const deadlineAt = new Date(
      startedAt.getTime() + visibleTest.durationMinutes * 60 * 1000,
    );

    const attempt = await this.db.$transaction(async (tx) => {
      const testQuestions = await tx.testQuestion.findMany({
        where: { testId },
        select: { id: true },
      });

      if (testQuestions.length === 0) {
        throw new BadRequestException({
          code: 'TEST_HAS_NO_QUESTIONS',
          message: 'This test cannot be started because it has no questions.',
        });
      }

      const created = await tx.testAttempt.create({
        data: {
          studentId,
          testId,
          status: TestAttemptStatus.IN_PROGRESS,
          startedAt,
          deadlineAt,
          answers: {
            create: testQuestions.map((testQuestion) => ({
              testQuestionId: testQuestion.id,
            })),
          },
        },
      });

      return created;
    });

    return this.safeAttemptStart(attempt);
  }

  async findOne(studentId: string, attemptId: string) {
    const attempt = await this.loadOwnedAttempt(studentId, attemptId);
    if (
      attempt.status === TestAttemptStatus.IN_PROGRESS &&
      attempt.deadlineAt <= new Date()
    ) {
      return this.finalizeById(
        studentId,
        attemptId,
        TestAttemptStatus.AUTO_SUBMITTED,
      );
    }

    if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
      return this.safeFinalizedAttempt(attempt);
    }

    return this.safeInProgressAttempt(attempt);
  }

  async saveAnswer(
    studentId: string,
    attemptId: string,
    testQuestionId: string,
    dto: SaveTestAttemptAnswerDto,
  ) {
    const outcome = await this.db.$transaction(async (tx) => {
      const attempt = await this.loadOwnedAttempt(studentId, attemptId, tx);
      if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
        return { finalized: this.safeFinalizedAttempt(attempt) };
      }

      if (attempt.deadlineAt <= new Date()) {
        return {
          finalized: await this.finalizeInTransaction(
            tx,
            attempt,
            TestAttemptStatus.AUTO_SUBMITTED,
          ),
        };
      }

      const testQuestion = await tx.testQuestion.findFirst({
        where: { id: testQuestionId, testId: attempt.testId },
        select: { id: true, questionId: true },
      });
      if (!testQuestion) {
        throw new NotFoundException({
          code: 'TEST_QUESTION_NOT_FOUND',
          message: 'Question does not belong to this test attempt.',
        });
      }

      if (dto.selectedOptionId) {
        const option = await tx.questionOption.findFirst({
          where: {
            id: dto.selectedOptionId,
            questionId: testQuestion.questionId,
          },
          select: { id: true },
        });
        if (!option) {
          throw new BadRequestException({
            code: 'INVALID_TEST_ANSWER_OPTION',
            message: 'Selected option does not belong to this question.',
          });
        }
      }

      const answer = await tx.testAttemptAnswer.upsert({
        where: {
          attemptId_testQuestionId: {
            attemptId,
            testQuestionId,
          },
        },
        create: {
          attemptId,
          testQuestionId,
          selectedOptionId: dto.selectedOptionId ?? null,
          isMarkedForReview: dto.markForReview ?? false,
          answeredAt: dto.selectedOptionId ? new Date() : null,
        },
        update: {
          ...(dto.selectedOptionId === undefined
            ? {}
            : {
                selectedOptionId: dto.selectedOptionId,
                answeredAt: dto.selectedOptionId ? new Date() : null,
              }),
          ...(dto.markForReview === undefined
            ? {}
            : { isMarkedForReview: dto.markForReview }),
        },
        select: {
          testQuestionId: true,
          selectedOptionId: true,
          isMarkedForReview: true,
          answeredAt: true,
        },
      });

      return { answer };
    });

    if ('finalized' in outcome) {
      throw new ConflictException({
        code: 'TEST_ATTEMPT_AUTO_SUBMITTED',
        message: 'The attempt reached its server deadline and was submitted.',
        attempt: outcome.finalized,
      });
    }

    return {
      testQuestionId: outcome.answer.testQuestionId,
      selectedOptionId: outcome.answer.selectedOptionId,
      isMarkedForReview: outcome.answer.isMarkedForReview,
      answeredAt: outcome.answer.answeredAt,
      answered: outcome.answer.selectedOptionId !== null,
    };
  }

  async submit(studentId: string, attemptId: string) {
    return this.db.$transaction(async (tx) => {
      const attempt = await this.loadOwnedAttempt(studentId, attemptId, tx);
      if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
        return this.safeFinalizedAttempt(attempt);
      }

      return this.finalizeInTransaction(
        tx,
        attempt,
        attempt.deadlineAt <= new Date()
          ? TestAttemptStatus.AUTO_SUBMITTED
          : TestAttemptStatus.SUBMITTED,
      );
    });
  }

  private async finalizeById(
    studentId: string,
    attemptId: string,
    status:
      | typeof TestAttemptStatus.AUTO_SUBMITTED
      | typeof TestAttemptStatus.SUBMITTED,
  ) {
    return this.db.$transaction(async (tx) => {
      const attempt = await this.loadOwnedAttempt(studentId, attemptId, tx);
      if (attempt.status !== TestAttemptStatus.IN_PROGRESS) {
        return this.safeFinalizedAttempt(attempt);
      }
      return this.finalizeInTransaction(tx, attempt, status);
    });
  }

  private async finalizeInTransaction(
    tx: Prisma.TransactionClient,
    attempt: Awaited<ReturnType<TestAttemptsService['loadOwnedAttempt']>>,
    status:
      | typeof TestAttemptStatus.AUTO_SUBMITTED
      | typeof TestAttemptStatus.SUBMITTED,
  ): Promise<FinalizationResult> {
    const testQuestions = await tx.testQuestion.findMany({
      where: { testId: attempt.testId },
      orderBy: { displayOrder: 'asc' },
      include: {
        question: {
          select: {
            options: {
              select: { id: true, isCorrect: true },
            },
          },
        },
      },
    });
    const answers = await tx.testAttemptAnswer.findMany({
      where: { attemptId: attempt.id },
      select: { id: true, testQuestionId: true, selectedOptionId: true },
    });
    const answerByQuestion = new Map(
      answers.map((answer) => [answer.testQuestionId, answer]),
    );

    let score = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    for (const testQuestion of testQuestions) {
      const answer = answerByQuestion.get(testQuestion.id);
      const selectedOptionId = answer?.selectedOptionId ?? null;
      const selectedIsCorrect = selectedOptionId
        ? testQuestion.question.options.some(
            (option) =>
              option.id === selectedOptionId && option.isCorrect === true,
          )
        : null;
      const awardedMarks =
        selectedIsCorrect === true
          ? testQuestion.marks
          : selectedIsCorrect === false
            ? -testQuestion.negativeMarks
            : 0;

      if (selectedIsCorrect === true) {
        correctCount += 1;
      } else if (selectedIsCorrect === false) {
        incorrectCount += 1;
      } else {
        unansweredCount += 1;
      }
      score += awardedMarks;

      if (answer) {
        await tx.testAttemptAnswer.update({
          where: { id: answer.id },
          data: {
            isCorrect: selectedIsCorrect,
            awardedMarks,
          },
        });
      } else {
        await tx.testAttemptAnswer.create({
          data: {
            attemptId: attempt.id,
            testQuestionId: testQuestion.id,
            selectedOptionId: null,
            isCorrect: null,
            awardedMarks: 0,
          },
        });
      }
    }

    const finalizedAt = new Date();
    const finalized = await tx.testAttempt.update({
      where: { id: attempt.id },
      data: {
        status,
        submittedAt: finalizedAt,
        ...(status === TestAttemptStatus.AUTO_SUBMITTED
          ? { autoSubmittedAt: finalizedAt }
          : {}),
        score,
        correctCount,
        incorrectCount,
        unansweredCount,
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        autoSubmittedAt: true,
        score: true,
        correctCount: true,
        incorrectCount: true,
        unansweredCount: true,
      },
    });

    return finalized;
  }

  private async loadOwnedAttempt(
    studentId: string,
    attemptId: string,
    client: PrismaService | Prisma.TransactionClient = this.db,
  ) {
    const attempt = await client.testAttempt.findFirst({
      where: { id: attemptId, studentId },
      include: {
        test: {
          select: {
            id: true,
            title: true,
            description: true,
            instructions: true,
            durationMinutes: true,
            totalMarks: true,
            availableFrom: true,
            availableUntil: true,
            sections: {
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true,
                title: true,
                instructions: true,
                displayOrder: true,
                questions: {
                  orderBy: { displayOrder: 'asc' },
                  select: {
                    id: true,
                    displayOrder: true,
                    marks: true,
                    negativeMarks: true,
                    question: {
                      select: {
                        id: true,
                        stem: true,
                        options: {
                          orderBy: { position: 'asc' },
                          select: {
                            id: true,
                            position: true,
                            text: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        answers: {
          select: {
            testQuestionId: true,
            selectedOptionId: true,
            isMarkedForReview: true,
            answeredAt: true,
          },
        },
      },
    });
    if (!attempt) {
      throw new NotFoundException({
        code: 'TEST_ATTEMPT_NOT_FOUND',
        message: 'Test attempt not found.',
      });
    }
    return attempt;
  }

  private safeAttemptStart(attempt: {
    id: string;
    testId: string;
    status: TestAttemptStatus;
    startedAt: Date;
    deadlineAt: Date;
  }) {
    return {
      id: attempt.id,
      testId: attempt.testId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
    };
  }

  private safeInProgressAttempt(
    attempt: Awaited<ReturnType<TestAttemptsService['loadOwnedAttempt']>>,
  ) {
    const answerByQuestion = new Map(
      attempt.answers.map((answer) => [answer.testQuestionId, answer]),
    );

    return {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        description: attempt.test.description,
        instructions: attempt.test.instructions,
        durationMinutes: attempt.test.durationMinutes,
        totalMarks: attempt.test.totalMarks,
        availableFrom: attempt.test.availableFrom,
        availableUntil: attempt.test.availableUntil,
      },
      sections: attempt.test.sections.map((section) => ({
        id: section.id,
        title: section.title,
        instructions: section.instructions,
        displayOrder: section.displayOrder,
        questions: section.questions.map((testQuestion) => {
          const answer = answerByQuestion.get(testQuestion.id);
          return {
            id: testQuestion.id,
            displayOrder: testQuestion.displayOrder,
            marks: testQuestion.marks,
            negativeMarks: testQuestion.negativeMarks,
            question: {
              id: testQuestion.question.id,
              stem: testQuestion.question.stem,
              options: testQuestion.question.options.map((option) => ({
                id: option.id,
                position: option.position,
                text: option.text,
              })),
            },
            selectedOptionId: answer?.selectedOptionId ?? null,
            isMarkedForReview: answer?.isMarkedForReview ?? false,
            answeredAt: answer?.answeredAt ?? null,
            answered: (answer?.selectedOptionId ?? null) !== null,
          };
        }),
      })),
      answers: Array.from(answerByQuestion.values()).map((answer) => ({
        testQuestionId: answer.testQuestionId,
        selectedOptionId: answer.selectedOptionId,
        isMarkedForReview: answer.isMarkedForReview,
        answeredAt: answer.answeredAt,
        answered: answer.selectedOptionId !== null,
      })),
    };
  }

  private safeFinalizedAttempt(
    attempt: Awaited<ReturnType<TestAttemptsService['loadOwnedAttempt']>>,
  ): FinalizationResult {
    return {
      id: attempt.id,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      autoSubmittedAt: attempt.autoSubmittedAt,
      score: attempt.score,
      correctCount: attempt.correctCount,
      incorrectCount: attempt.incorrectCount,
      unansweredCount: attempt.unansweredCount,
    };
  }
}
