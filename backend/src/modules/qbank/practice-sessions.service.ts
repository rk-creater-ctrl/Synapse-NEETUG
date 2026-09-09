import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionPracticeSessionStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  AnswerQuestionPracticeItemDto,
  CreateQuestionPracticeSessionDto,
  ListQuestionPracticeSessionsDto,
} from './practice-sessions.dto';
import { StudentQuestionsService } from './student-questions.service';

export type StudentQuestionReader = Pick<StudentQuestionsService, 'get' | 'list'>;

type PracticeSessionDelegate = Pick<
  PrismaService['questionPracticeSession'],
  'create' | 'findFirst' | 'findMany' | 'count' | 'updateMany'
>;
type PracticeItemDelegate = Pick<
  PrismaService['questionPracticeItem'],
  'findFirst' | 'findMany' | 'updateMany'
>;
type PracticeQuestionDelegate = Pick<PrismaService['question'], 'findUnique'>;

export type PracticeSessionTransaction = {
  questionPracticeSession: PracticeSessionDelegate;
  questionPracticeItem: PracticeItemDelegate;
  question: PracticeQuestionDelegate;
};

export interface PracticeSessionDatabase {
  questionPracticeSession: PracticeSessionDelegate;
  $transaction<T>(
    callback: (transaction: PracticeSessionTransaction) => PromiseLike<T>,
  ): Promise<T>;
}

type PracticeQuestion = {
  id: string;
  type: string;
  sourceType: string;
  stem: string;
  explanation: string;
  difficulty: string;
  tags: string[];
  displayOrder: number;
  exam: { id: string; name: string; slug: string };
  subject: { id: string; name: string; slug: string };
  academicClass: { id: string; name: string; slug: string };
  chapter: { id: string; name: string; slug: string };
  topic: { id: string; name: string; slug: string };
  subtopic: { id: string; name: string; slug: string } | null;
  pyqMetadata: {
    sourceExam: string;
    year: number;
    sessionKey: string;
    paperKey: string;
    questionNumber: number;
  } | null;
  options: { id: string; position: number; text: string; isCorrect: boolean }[];
};

type PracticeItem = {
  id: string;
  sequence: number;
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  timeSpentSeconds: number | null;
  answeredAt: Date | null;
  question: PracticeQuestion;
};

@Injectable()
export class QuestionPracticeSessionsService {
  constructor(
    @Inject(PrismaService)
    private readonly db: PracticeSessionDatabase,
    @Inject(StudentQuestionsService)
    private readonly studentQuestions: StudentQuestionReader,
  ) {}

  async create(studentId: string, dto: CreateQuestionPracticeSessionDto) {
    // The existing public service is the single source of truth for student
    // visibility, including premium and ancestor-publishing restrictions.
    const selected = await this.studentQuestions.list({
      ...this.filtersFrom(dto),
      page: 1,
      limit: dto.questionCount ?? 20,
    });
    const questionIds = selected.items.map((question) => question.id);

    return this.db.$transaction(async (tx) => {
      const session = await tx.questionPracticeSession.create({
        data: {
          studentId,
          selectedFilters: this.filtersFrom(dto) as Prisma.InputJsonValue,
          items: {
            create: questionIds.map((questionId, index) => ({
              questionId,
              sequence: index + 1,
            })),
          },
        },
        select: this.summarySelect(),
      });
      return this.toSummary(session);
    });
  }

  async list(studentId: string, dto: ListQuestionPracticeSessionsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const { sessions, total } = await this.db.$transaction(async (tx) => {
      const [sessions, total] = await Promise.all([
        tx.questionPracticeSession.findMany({
        where: { studentId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        select: this.summarySelect(),
        }),
        tx.questionPracticeSession.count({ where: { studentId } }),
      ]);
      return { sessions, total };
    });

    return {
      items: sessions.map((session) => this.toSummary(session)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async get(studentId: string, sessionId: string) {
    const session = await this.db.questionPracticeSession.findFirst({
      where: { id: sessionId, studentId },
      select: {
        ...this.summarySelect(),
        items: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            sequence: true,
            selectedOptionId: true,
            isCorrect: true,
            timeSpentSeconds: true,
            answeredAt: true,
            question: { select: this.questionSelect() },
          },
        },
      },
    });
    if (!session) {
      throw this.notFound('PRACTICE_SESSION_NOT_FOUND', 'Practice session not found');
    }

    const visibleIds = await this.currentlyVisibleIds(session.items.map((item) => item.question.id));
    return {
      ...this.toSummary(session),
      items: session.items.map((item) => this.toItem(item, visibleIds)),
    };
  }

  async answer(
    studentId: string,
    sessionId: string,
    itemId: string,
    dto: AnswerQuestionPracticeItemDto,
  ) {
    return this.db.$transaction(async (tx) => {
      const session = await tx.questionPracticeSession.findFirst({
        where: { id: sessionId, studentId },
        select: { status: true },
      });
      if (!session) {
        throw this.notFound('PRACTICE_SESSION_NOT_FOUND', 'Practice session not found');
      }
      if (session.status !== QuestionPracticeSessionStatus.IN_PROGRESS) {
        throw this.conflict('PRACTICE_SESSION_NOT_IN_PROGRESS', 'This practice session can no longer be answered');
      }

      const item = await tx.questionPracticeItem.findFirst({
        where: { id: itemId, sessionId },
        select: { id: true, questionId: true, answeredAt: true },
      });
      if (!item) {
        throw this.notFound('PRACTICE_ITEM_NOT_FOUND', 'Practice item not found');
      }
      if (item.answeredAt) {
        throw this.conflict('PRACTICE_ITEM_ALREADY_ANSWERED', 'This practice item has already been answered');
      }

      // A session never keeps serving a question after it becomes hidden.
      try {
        await this.studentQuestions.get(item.questionId);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw this.notFound('QUESTION_NOT_AVAILABLE', 'Question is no longer available');
        }
        throw error;
      }

      const question = await tx.question.findUnique({
        where: { id: item.questionId },
        select: {
          id: true,
          explanation: true,
          options: { orderBy: { position: 'asc' }, select: { id: true, isCorrect: true } },
        },
      });
      if (!question) {
        throw this.notFound('QUESTION_NOT_AVAILABLE', 'Question is no longer available');
      }
      const selectedOption = question.options.find((option) => option.id === dto.selectedOptionId);
      if (!selectedOption) {
        throw this.badRequest('INVALID_PRACTICE_OPTION', 'The selected option does not belong to this question');
      }
      const correctOption = question.options.find((option) => option.isCorrect);
      if (!correctOption) {
        throw this.badRequest('QUESTION_ANSWER_INVALID', 'Question answer data is invalid');
      }

      const answeredAt = new Date();
      const updated = await tx.questionPracticeItem.updateMany({
        where: {
          id: item.id,
          sessionId,
          answeredAt: null,
          session: { is: { studentId, status: QuestionPracticeSessionStatus.IN_PROGRESS } },
        },
        data: {
          selectedOptionId: selectedOption.id,
          isCorrect: selectedOption.isCorrect,
          timeSpentSeconds: dto.timeSpentSeconds ?? null,
          answeredAt,
        },
      });
      if (updated.count !== 1) {
        throw this.conflict('PRACTICE_ITEM_NOT_AVAILABLE', 'This practice item can no longer be answered');
      }

      return {
        itemId: item.id,
        questionId: question.id,
        selectedOptionId: selectedOption.id,
        isCorrect: selectedOption.isCorrect,
        correctOptionId: correctOption.id,
        explanation: question.explanation,
        timeSpentSeconds: dto.timeSpentSeconds ?? null,
        answeredAt,
      };
    });
  }

  async complete(studentId: string, sessionId: string) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.questionPracticeSession.findFirst({
        where: { id: sessionId, studentId },
        select: { status: true },
      });
      if (!existing) {
        throw this.notFound('PRACTICE_SESSION_NOT_FOUND', 'Practice session not found');
      }
      if (existing.status !== QuestionPracticeSessionStatus.IN_PROGRESS) {
        throw this.conflict('PRACTICE_SESSION_NOT_IN_PROGRESS', 'This practice session has already been completed');
      }

      const completedAt = new Date();
      const updated = await tx.questionPracticeSession.updateMany({
        where: { id: sessionId, studentId, status: QuestionPracticeSessionStatus.IN_PROGRESS },
        data: { status: QuestionPracticeSessionStatus.COMPLETED, completedAt },
      });
      if (updated.count !== 1) {
        throw this.conflict('PRACTICE_SESSION_NOT_IN_PROGRESS', 'This practice session can no longer be completed');
      }
      const items = await tx.questionPracticeItem.findMany({
        where: { sessionId },
        select: { isCorrect: true },
      });
      return this.summaryFromItems({
        id: sessionId,
        status: QuestionPracticeSessionStatus.COMPLETED,
        completedAt,
        items,
      });
    });
  }

  private filtersFrom(dto: CreateQuestionPracticeSessionDto) {
    const filters: Record<string, string | number | boolean> = {};
    if (dto.examId !== undefined) filters.examId = dto.examId;
    if (dto.subjectId !== undefined) filters.subjectId = dto.subjectId;
    if (dto.classId !== undefined) filters.classId = dto.classId;
    if (dto.chapterId !== undefined) filters.chapterId = dto.chapterId;
    if (dto.topicId !== undefined) filters.topicId = dto.topicId;
    if (dto.subtopicId !== undefined) filters.subtopicId = dto.subtopicId;
    if (dto.pyqOnly !== undefined) filters.pyqOnly = dto.pyqOnly;
    if (dto.pyqYear !== undefined) filters.pyqYear = dto.pyqYear;
    if (dto.difficulty !== undefined) filters.difficulty = dto.difficulty;
    const tag = dto.tag?.trim();
    if (tag) filters.tag = tag;
    return filters;
  }

  private async currentlyVisibleIds(questionIds: string[]) {
    const visibility = await Promise.all(questionIds.map(async (questionId) => {
      try {
        await this.studentQuestions.get(questionId);
        return questionId;
      } catch (error) {
        if (error instanceof NotFoundException) {
          return null;
        }
        throw error;
      }
    }));
    return new Set(visibility.filter((questionId): questionId is string => questionId !== null));
  }

  private toItem(item: PracticeItem, visibleIds: Set<string>) {
    if (!visibleIds.has(item.question.id)) {
      return { id: item.id, sequence: item.sequence, unavailable: true };
    }
    const base = {
      id: item.id,
      sequence: item.sequence,
      unavailable: false,
      question: {
        id: item.question.id,
        type: item.question.type,
        sourceType: item.question.sourceType,
        stem: item.question.stem,
        difficulty: item.question.difficulty,
        tags: item.question.tags,
        displayOrder: item.question.displayOrder,
        exam: item.question.exam,
        subject: item.question.subject,
        academicClass: item.question.academicClass,
        chapter: item.question.chapter,
        topic: item.question.topic,
        subtopic: item.question.subtopic,
        pyqMetadata: item.question.pyqMetadata,
        options: item.question.options.map(({ id, position, text }) => ({ id, position, text })),
      },
    };
    if (!item.answeredAt) {
      return base;
    }
    return {
      ...base,
      answer: {
        selectedOptionId: item.selectedOptionId,
        isCorrect: item.isCorrect,
        correctOptionId: item.question.options.find((option) => option.isCorrect)?.id,
        explanation: item.question.explanation,
        timeSpentSeconds: item.timeSpentSeconds,
        answeredAt: item.answeredAt,
      },
    };
  }

  private summarySelect() {
    return {
      id: true,
      status: true,
      selectedFilters: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      items: { select: { isCorrect: true } },
    } as const;
  }

  private toSummary(session: {
    id: string;
    status: QuestionPracticeSessionStatus;
    selectedFilters: Prisma.JsonValue;
    startedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    items: { isCorrect: boolean | null }[];
  }) {
    return this.summaryFromItems(session);
  }

  private summaryFromItems(session: {
    id: string;
    status: QuestionPracticeSessionStatus;
    completedAt: Date | null;
    items: { isCorrect: boolean | null }[];
    selectedFilters?: Prisma.JsonValue;
    startedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const totalQuestions = session.items.length;
    const answeredQuestions = session.items.filter((item) => item.isCorrect !== null).length;
    const correctAnswers = session.items.filter((item) => item.isCorrect === true).length;
    const incorrectAnswers = session.items.filter((item) => item.isCorrect === false).length;
    return {
      id: session.id,
      status: session.status,
      ...(session.selectedFilters === undefined ? {} : { selectedFilters: session.selectedFilters }),
      ...(session.startedAt === undefined ? {} : { startedAt: session.startedAt }),
      completedAt: session.completedAt,
      ...(session.createdAt === undefined ? {} : { createdAt: session.createdAt }),
      ...(session.updatedAt === undefined ? {} : { updatedAt: session.updatedAt }),
      summary: {
        totalQuestions,
        answeredQuestions,
        correctAnswers,
        incorrectAnswers,
        unansweredQuestions: totalQuestions - answeredQuestions,
        accuracyPercentage: answeredQuestions === 0 ? 0 : Number(((correctAnswers / answeredQuestions) * 100).toFixed(2)),
      },
    };
  }

  private questionSelect() {
    return {
      id: true, type: true, sourceType: true, stem: true, explanation: true,
      difficulty: true, tags: true, displayOrder: true,
      exam: { select: { id: true, name: true, slug: true } },
      subject: { select: { id: true, name: true, slug: true } },
      academicClass: { select: { id: true, name: true, slug: true } },
      chapter: { select: { id: true, name: true, slug: true } },
      topic: { select: { id: true, name: true, slug: true } },
      subtopic: { select: { id: true, name: true, slug: true } },
      pyqMetadata: { select: { sourceExam: true, year: true, sessionKey: true, paperKey: true, questionNumber: true } },
      options: { orderBy: { position: 'asc' }, select: { id: true, position: true, text: true, isCorrect: true } },
    } as const;
  }

  private notFound(code: string, message: string) {
    return new NotFoundException({ code, message });
  }

  private conflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }

  private badRequest(code: string, message: string) {
    return new BadRequestException({ code, message });
  }
}
