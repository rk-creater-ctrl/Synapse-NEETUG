import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import {
  AdminTestListQueryDto,
  CreateTestDto,
  TestSectionDto,
  UpdateTestDto,
} from './tests.dto';

const MAX_PAGE_SIZE = 100;

type TestScope = Pick<
  CreateTestDto,
  | 'examId'
  | 'subjectId'
  | 'academicClassId'
  | 'chapterId'
  | 'topicId'
  | 'subtopicId'
>;

@Injectable()
export class TestsService {
  constructor(private readonly db: PrismaService) {}

  async list(query: AdminTestListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, query.limit ?? 20));
    const now = new Date();
    const where: Prisma.TestWhereInput = {
      ...(query.search
        ? {
            title: {
              contains: query.search.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(query.examId ? { examId: query.examId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.academicClassId
        ? { academicClassId: query.academicClassId }
        : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.topicId ? { topicId: query.topicId } : {}),
      ...(query.subtopicId ? { subtopicId: query.subtopicId } : {}),
      ...(query.isPublished === undefined
        ? {}
        : { isPublished: query.isPublished }),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.isFree === undefined ? {} : { isFree: query.isFree }),
      ...(query.availability === 'SCHEDULED'
        ? { availableFrom: { gt: now } }
        : {}),
      ...(query.availability === 'AVAILABLE'
        ? {
            AND: [
              { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
              { OR: [{ availableUntil: null }, { availableUntil: { gte: now } }] },
            ],
          }
        : {}),
      ...(query.availability === 'ENDED'
        ? { availableUntil: { lt: now } }
        : {}),
    };

    const [items, total] = await this.db.$transaction([
      this.db.test.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        include: {
          exam: true,
          subject: true,
          academicClass: true,
          chapter: true,
          topic: true,
          subtopic: true,
          _count: { select: { sections: true, attempts: true } },
        },
      }),
      this.db.test.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const test = await this.db.test.findUnique({
      where: { id },
      include: {
        exam: true,
        subject: true,
        academicClass: true,
        chapter: true,
        topic: true,
        subtopic: true,
        sections: {
          orderBy: { displayOrder: 'asc' },
          include: {
            questions: {
              orderBy: { displayOrder: 'asc' },
              include: {
                question: {
                  include: {
                    options: { orderBy: { position: 'asc' } },
                    pyqMetadata: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!test) {
      throw new NotFoundException({
        code: 'TEST_NOT_FOUND',
        message: 'Test not found.',
      });
    }

    return test;
  }

  async create(dto: CreateTestDto) {
    const scope = this.scopeFrom(dto);
    this.validateSchedule(dto.availableFrom, dto.availableUntil);
    this.validateStructure(dto.sections);
    await this.validateScope(scope);
    await this.validateQuestions(dto.sections, scope);

    return this.db.$transaction(async (tx) => {
      const test = await tx.test.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          instructions: dto.instructions?.trim() || null,
          ...scope,
          durationMinutes: dto.durationMinutes,
          totalMarks: this.totalMarks(dto.sections),
          isPublished: dto.isPublished ?? false,
          isActive: dto.isActive ?? true,
          isFree: dto.isFree ?? false,
          availableFrom: this.toDate(dto.availableFrom),
          availableUntil: this.toDate(dto.availableUntil),
        },
      });

      await this.createStructure(tx, test.id, dto.sections);
      return this.findOneInTransaction(tx, test.id);
    });
  }

  async update(id: string, dto: UpdateTestDto) {
    const existing = await this.db.test.findUnique({
      where: { id },
      include: { _count: { select: { attempts: true } } },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'TEST_NOT_FOUND',
        message: 'Test not found.',
      });
    }

    if (existing._count.attempts > 0) {
      throw new ConflictException({
        code: 'TEST_ATTEMPTS_EXIST',
        message:
          'A test with existing attempts cannot be changed to preserve attempt integrity.',
      });
    }

    const scope: TestScope = {
      examId: dto.examId ?? existing.examId,
      subjectId: dto.subjectId === undefined ? existing.subjectId : dto.subjectId,
      academicClassId:
        dto.academicClassId === undefined
          ? existing.academicClassId
          : dto.academicClassId,
      chapterId: dto.chapterId === undefined ? existing.chapterId : dto.chapterId,
      topicId: dto.topicId === undefined ? existing.topicId : dto.topicId,
      subtopicId:
        dto.subtopicId === undefined ? existing.subtopicId : dto.subtopicId,
    };
    const availableFrom =
      dto.availableFrom === undefined
        ? existing.availableFrom?.toISOString() ?? null
        : dto.availableFrom;
    const availableUntil =
      dto.availableUntil === undefined
        ? existing.availableUntil?.toISOString() ?? null
        : dto.availableUntil;

    this.validateSchedule(availableFrom, availableUntil);
    await this.validateScope(scope);
    if (dto.sections) {
      this.validateStructure(dto.sections);
      await this.validateQuestions(dto.sections, scope);
    }

    return this.db.$transaction(async (tx) => {
      const test = await tx.test.update({
        where: { id },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description?.trim() || null }),
          ...(dto.instructions === undefined
            ? {}
            : { instructions: dto.instructions?.trim() || null }),
          ...scope,
          ...(dto.durationMinutes === undefined
            ? {}
            : { durationMinutes: dto.durationMinutes }),
          ...(dto.isPublished === undefined
            ? {}
            : { isPublished: dto.isPublished }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(dto.isFree === undefined ? {} : { isFree: dto.isFree }),
          availableFrom: this.toDate(availableFrom),
          availableUntil: this.toDate(availableUntil),
          ...(dto.sections
            ? { totalMarks: this.totalMarks(dto.sections) }
            : {}),
        },
      });

      if (dto.sections) {
        await tx.testSection.deleteMany({ where: { testId: id } });
        await this.createStructure(tx, id, dto.sections);
      }

      return this.findOneInTransaction(tx, test.id);
    });
  }

  private async createStructure(
    tx: Prisma.TransactionClient,
    testId: string,
    sections: TestSectionDto[],
  ) {
    for (const sectionInput of sections) {
      const section = await tx.testSection.create({
        data: {
          testId,
          title: sectionInput.title.trim(),
          instructions: sectionInput.instructions?.trim() || null,
          displayOrder: sectionInput.displayOrder,
        },
      });

      await tx.testQuestion.createMany({
        data: sectionInput.questions.map((question) => ({
          testId,
          sectionId: section.id,
          questionId: question.questionId,
          displayOrder: question.displayOrder,
          marks: question.marks,
          negativeMarks: question.negativeMarks,
        })),
      });
    }
  }

  private async findOneInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
  ) {
    return tx.test.findUniqueOrThrow({
      where: { id },
      include: {
        sections: {
          orderBy: { displayOrder: 'asc' },
          include: {
            questions: {
              orderBy: { displayOrder: 'asc' },
              include: {
                question: {
                  include: {
                    options: { orderBy: { position: 'asc' } },
                    pyqMetadata: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private scopeFrom(dto: CreateTestDto): TestScope {
    return {
      examId: dto.examId,
      subjectId: dto.subjectId ?? null,
      academicClassId: dto.academicClassId ?? null,
      chapterId: dto.chapterId ?? null,
      topicId: dto.topicId ?? null,
      subtopicId: dto.subtopicId ?? null,
    };
  }

  private validateStructure(sections: TestSectionDto[]) {
    const sectionOrders = new Set<number>();
    const questionIds = new Set<string>();

    for (const section of sections) {
      if (sectionOrders.has(section.displayOrder)) {
        throw new BadRequestException({
          code: 'TEST_SECTION_ORDER_DUPLICATE',
          message: 'Section display orders must be unique within a test.',
        });
      }
      sectionOrders.add(section.displayOrder);

      const questionOrders = new Set<number>();
      for (const question of section.questions) {
        if (question.marks < 0 || question.negativeMarks < 0) {
          throw new BadRequestException({
            code: 'INVALID_TEST_MARKS',
            message:
              'Question marks and negative-mark magnitudes must be zero or greater.',
          });
        }

        if (questionIds.has(question.questionId)) {
          throw new BadRequestException({
            code: 'TEST_QUESTION_DUPLICATE',
            message: 'A question can be placed only once within a test.',
          });
        }
        questionIds.add(question.questionId);

        if (questionOrders.has(question.displayOrder)) {
          throw new BadRequestException({
            code: 'TEST_QUESTION_ORDER_DUPLICATE',
            message: 'Question display orders must be unique within a section.',
          });
        }
        questionOrders.add(question.displayOrder);
      }
    }

    if (questionIds.size === 0) {
      throw new BadRequestException({
        code: 'TEST_QUESTIONS_REQUIRED',
        message: 'A formal test must contain at least one question.',
      });
    }
  }

  private async validateScope(scope: TestScope) {
    const exam = await this.db.exam.findUnique({ where: { id: scope.examId } });
    if (!exam) {
      throw new BadRequestException({
        code: 'INVALID_TEST_HIERARCHY',
        message: 'The selected exam does not exist.',
      });
    }

    if (scope.subjectId) {
      const subject = await this.db.subject.findUnique({
        where: { id: scope.subjectId },
      });
      if (!subject || subject.examId !== scope.examId) {
        throw new BadRequestException({
          code: 'INVALID_TEST_HIERARCHY',
          message: 'The selected subject does not belong to the exam.',
        });
      }
    }

    if (scope.academicClassId) {
      const academicClass = await this.db.academicClass.findUnique({
        where: { id: scope.academicClassId },
      });
      if (!academicClass || academicClass.subjectId !== scope.subjectId) {
        throw new BadRequestException({
          code: 'INVALID_TEST_HIERARCHY',
          message: 'The selected class does not belong to the subject.',
        });
      }
    }

    if (scope.chapterId) {
      const chapter = await this.db.chapter.findUnique({
        where: { id: scope.chapterId },
      });
      if (!chapter || chapter.classId !== scope.academicClassId) {
        throw new BadRequestException({
          code: 'INVALID_TEST_HIERARCHY',
          message: 'The selected chapter does not belong to the class.',
        });
      }
    }

    if (scope.topicId) {
      const topic = await this.db.topic.findUnique({
        where: { id: scope.topicId },
      });
      if (!topic || topic.chapterId !== scope.chapterId) {
        throw new BadRequestException({
          code: 'INVALID_TEST_HIERARCHY',
          message: 'The selected topic does not belong to the chapter.',
        });
      }
    }

    if (scope.subtopicId) {
      const subtopic = await this.db.subtopic.findUnique({
        where: { id: scope.subtopicId },
      });
      if (!subtopic || subtopic.topicId !== scope.topicId) {
        throw new BadRequestException({
          code: 'INVALID_TEST_HIERARCHY',
          message: 'The selected subtopic does not belong to the topic.',
        });
      }
    }
  }

  private async validateQuestions(
    sections: TestSectionDto[],
    scope: TestScope,
  ) {
    const questionIds = sections.flatMap((section) =>
      section.questions.map((question) => question.questionId),
    );
    const questions = await this.db.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        examId: true,
        subjectId: true,
        academicClassId: true,
        chapterId: true,
        topicId: true,
        subtopicId: true,
        isActive: true,
        isPublished: true,
      },
    });

    if (questions.length !== questionIds.length) {
      throw new BadRequestException({
        code: 'TEST_QUESTION_NOT_FOUND',
        message: 'One or more selected questions do not exist.',
      });
    }

    for (const question of questions) {
      if (!question.isActive || !question.isPublished) {
        throw new BadRequestException({
          code: 'TEST_QUESTION_UNAVAILABLE',
          message: 'Only active, published questions can be placed in a test.',
        });
      }

      const isInScope =
        question.examId === scope.examId &&
        (!scope.subjectId || question.subjectId === scope.subjectId) &&
        (!scope.academicClassId ||
          question.academicClassId === scope.academicClassId) &&
        (!scope.chapterId || question.chapterId === scope.chapterId) &&
        (!scope.topicId || question.topicId === scope.topicId) &&
        (!scope.subtopicId || question.subtopicId === scope.subtopicId);
      if (!isInScope) {
        throw new BadRequestException({
          code: 'TEST_QUESTION_SCOPE_MISMATCH',
          message: 'A selected question does not belong to the test scope.',
        });
      }
    }
  }

  private validateSchedule(
    availableFrom?: string | null,
    availableUntil?: string | null,
  ) {
    const from = this.toDate(availableFrom);
    const until = this.toDate(availableUntil);
    if (from && until && from >= until) {
      throw new BadRequestException({
        code: 'INVALID_TEST_SCHEDULE',
        message: 'availableFrom must be earlier than availableUntil.',
      });
    }
  }

  private totalMarks(sections: TestSectionDto[]) {
    return sections.reduce(
      (total, section) =>
        total +
        section.questions.reduce((sectionTotal, question) => {
          return sectionTotal + question.marks;
        }, 0),
      0,
    );
  }

  private toDate(value?: string | null) {
    return value ? new Date(value) : null;
  }
}
