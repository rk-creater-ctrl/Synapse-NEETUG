import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TestAttemptStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class TestResultsService {
  constructor(private readonly db: PrismaService) {}

  async result(studentId: string, attemptId: string) {
    const attempt = await this.db.testAttempt.findFirst({
      where: { id: attemptId, studentId },
      select: {
        id: true,
        testId: true,
        status: true,
        startedAt: true,
        deadlineAt: true,
        submittedAt: true,
        autoSubmittedAt: true,
        score: true,
        correctCount: true,
        incorrectCount: true,
        unansweredCount: true,
        test: {
          select: {
            title: true,
            totalMarks: true,
            sections: {
              select: {
                _count: { select: { questions: true } },
              },
            },
          },
        },
      },
    });

    this.assertFinalized(attempt);

    return {
      attemptId: attempt.id,
      testId: attempt.testId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      autoSubmittedAt: attempt.autoSubmittedAt,
      score: attempt.score,
      totalMarks: attempt.test.totalMarks,
      correctCount: attempt.correctCount,
      incorrectCount: attempt.incorrectCount,
      unansweredCount: attempt.unansweredCount,
      totalQuestionCount: attempt.test.sections.reduce(
        (total, section) => total + section._count.questions,
        0,
      ),
      testTitle: attempt.test.title,
    };
  }

  async review(studentId: string, attemptId: string) {
    const attempt = await this.db.testAttempt.findFirst({
      where: { id: attemptId, studentId },
      select: {
        id: true,
        testId: true,
        status: true,
        test: {
          select: {
            id: true,
            title: true,
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
                    questionId: true,
                    displayOrder: true,
                    marks: true,
                    negativeMarks: true,
                    question: {
                      select: {
                        stem: true,
                        explanation: true,
                        options: {
                          orderBy: { position: 'asc' },
                          select: {
                            id: true,
                            position: true,
                            text: true,
                            isCorrect: true,
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
            isCorrect: true,
            awardedMarks: true,
          },
        },
      },
    });

    this.assertFinalized(attempt);

    const answerByTestQuestion = new Map(
      attempt.answers.map((answer) => [answer.testQuestionId, answer]),
    );

    return {
      attemptId: attempt.id,
      testId: attempt.testId,
      status: attempt.status,
      testTitle: attempt.test.title,
      sections: attempt.test.sections.map((section) => {
        const questions = section.questions.map((testQuestion) => {
          const answer = answerByTestQuestion.get(testQuestion.id);
          return {
            testQuestionId: testQuestion.id,
            questionId: testQuestion.questionId,
            displayOrder: testQuestion.displayOrder,
            marks: testQuestion.marks,
            negativeMarks: testQuestion.negativeMarks,
            stem: testQuestion.question.stem,
            explanation: testQuestion.question.explanation,
            options: testQuestion.question.options.map((option) => ({
              id: option.id,
              position: option.position,
              text: option.text,
              isCorrect: option.isCorrect,
            })),
            selectedOptionId: answer?.selectedOptionId ?? null,
            answered: (answer?.selectedOptionId ?? null) !== null,
            isMarkedForReview: answer?.isMarkedForReview ?? false,
            answeredAt: answer?.answeredAt ?? null,
            isCorrect: answer?.isCorrect ?? null,
            awardedMarks: answer?.awardedMarks ?? null,
          };
        });

        return {
          id: section.id,
          title: section.title,
          instructions: section.instructions,
          displayOrder: section.displayOrder,
          questionCount: questions.length,
          correctCount: questions.filter(
            (question) => question.isCorrect === true,
          ).length,
          incorrectCount: questions.filter(
            (question) => question.isCorrect === false,
          ).length,
          unansweredCount: questions.filter(
            (question) => question.selectedOptionId === null,
          ).length,
          score: questions.reduce(
            (total, question) => total + (question.awardedMarks ?? 0),
            0,
          ),
          questions,
        };
      }),
    };
  }

  private assertFinalized<T extends { status: TestAttemptStatus }>(
    attempt: T | null,
  ): asserts attempt is T {
    if (!attempt) {
      throw new NotFoundException({
        code: 'TEST_ATTEMPT_NOT_FOUND',
        message: 'Test attempt not found.',
      });
    }

    if (
      attempt.status !== TestAttemptStatus.SUBMITTED &&
      attempt.status !== TestAttemptStatus.AUTO_SUBMITTED
    ) {
      throw new ConflictException({
        code: 'TEST_ATTEMPT_NOT_FINALIZED',
        message: 'Results are available only after the attempt is finalized.',
      });
    }
  }
}
