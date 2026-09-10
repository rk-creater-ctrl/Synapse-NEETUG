import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StudentTestListQueryDto } from './student-tests.dto';

const MAX_STUDENT_TEST_PAGE_SIZE = 100;

@Injectable()
export class StudentTestsService {
  constructor(private readonly db: PrismaService) {}

  async list(query: StudentTestListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      MAX_STUDENT_TEST_PAGE_SIZE,
      Math.max(1, query.limit ?? 20),
    );
    const where = this.visibleWhere(query);

    const [items, total] = await this.db.$transaction([
      this.db.test.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ availableFrom: 'asc' }, { title: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          examId: true,
          subjectId: true,
          academicClassId: true,
          chapterId: true,
          topicId: true,
          subtopicId: true,
          durationMinutes: true,
          totalMarks: true,
          isFree: true,
          availableFrom: true,
          availableUntil: true,
          _count: { select: { sections: true } },
        },
      }),
      this.db.test.count({ where }),
    ]);

    return {
      items: items.map(({ _count, ...test }) => ({
        ...test,
        sectionCount: _count.sections,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const test = await this.db.test.findFirst({
      where: {
        ...this.visibleWhere({}),
        id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        examId: true,
        subjectId: true,
        academicClassId: true,
        chapterId: true,
        topicId: true,
        subtopicId: true,
        durationMinutes: true,
        totalMarks: true,
        isFree: true,
        availableFrom: true,
        availableUntil: true,
        sections: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            title: true,
            instructions: true,
            displayOrder: true,
            _count: { select: { questions: true } },
          },
        },
      },
    });

    if (!test) {
      throw new NotFoundException({
        code: 'TEST_NOT_FOUND',
        message: 'Test not found or is not available.',
      });
    }

    const { sections, ...metadata } = test;
    return {
      ...metadata,
      totalQuestionCount: sections.reduce(
        (total, section) => total + section._count.questions,
        0,
      ),
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        instructions: section.instructions,
        displayOrder: section.displayOrder,
        questionCount: section._count.questions,
      })),
    };
  }

  async findVisibleForAttempt(id: string) {
    const test = await this.db.test.findFirst({
      where: {
        ...this.visibleWhere({}),
        id,
      },
      select: {
        id: true,
        durationMinutes: true,
        totalMarks: true,
      },
    });

    if (!test) {
      throw new NotFoundException({
        code: 'TEST_NOT_FOUND',
        message: 'Test not found or is not available.',
      });
    }

    return test;
  }

  private visibleWhere(
    query: Omit<StudentTestListQueryDto, 'page' | 'limit'>,
  ): Prisma.TestWhereInput {
    const now = new Date();

    return {
      isActive: true,
      isPublished: true,
      isFree: true,
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
      AND: [
        { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
        { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
        { exam: { isActive: true, isPublished: true } },
        {
          OR: [
            { subjectId: null },
            { subject: { isActive: true, isPublished: true } },
          ],
        },
        {
          OR: [
            { academicClassId: null },
            { academicClass: { isActive: true, isPublished: true } },
          ],
        },
        {
          OR: [
            { chapterId: null },
            { chapter: { isActive: true, isPublished: true } },
          ],
        },
        {
          OR: [
            { topicId: null },
            { topic: { isActive: true, isPublished: true } },
          ],
        },
        {
          OR: [
            { subtopicId: null },
            { subtopic: { isActive: true, isPublished: true } },
          ],
        },
      ],
    };
  }
}
