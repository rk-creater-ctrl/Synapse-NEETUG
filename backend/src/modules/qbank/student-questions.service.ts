import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionSourceType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StudentQuestionListDto } from './student-questions.dto';

const visible = { isActive: true, isPublished: true };

type StudentQuestionFilters = Pick<
  StudentQuestionListDto,
  | 'examId'
  | 'subjectId'
  | 'classId'
  | 'chapterId'
  | 'topicId'
  | 'subtopicId'
  | 'pyqOnly'
  | 'pyqYear'
  | 'difficulty'
  | 'tag'
>;

@Injectable()
export class StudentQuestionsService {
  constructor(private readonly db: PrismaService) {}

  async list(query: StudentQuestionListDto = new StudentQuestionListDto()) {
    const where = this.visibleWhere(query);
    const [items, total] = await this.db.$transaction([
      this.db.question.findMany({
        where,
        select: this.safeSelect(),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { displayOrder: 'asc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
      }),
      this.db.question.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async get(id: string) {
    const question = await this.db.question.findFirst({
      where: { id, ...this.visibleWhere({}) },
      select: this.safeSelect(),
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  private safeSelect() {
    return {
      id: true,
      type: true,
      sourceType: true,
      stem: true,
      difficulty: true,
      tags: true,
      displayOrder: true,
      exam: { select: { id: true, name: true, slug: true } },
      subject: { select: { id: true, name: true, slug: true } },
      academicClass: { select: { id: true, name: true, slug: true } },
      chapter: { select: { id: true, name: true, slug: true } },
      topic: { select: { id: true, name: true, slug: true } },
      subtopic: { select: { id: true, name: true, slug: true } },
      pyqMetadata: {
        select: {
          sourceExam: true,
          year: true,
          sessionKey: true,
          paperKey: true,
          questionNumber: true,
        },
      },
      options: {
        select: { id: true, position: true, text: true },
        orderBy: { position: 'asc' as const },
      },
    } satisfies Prisma.QuestionSelect;
  }

  private visibleWhere(query: StudentQuestionFilters): Prisma.QuestionWhereInput {
    const where: Prisma.QuestionWhereInput = {
      isActive: true,
      isPublished: true,
      isFree: true,
      ...this.contentVisibility(),
    };
    if (query.examId) where.examId = query.examId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.classId) where.academicClassId = query.classId;
    if (query.chapterId) where.chapterId = query.chapterId;
    if (query.topicId) where.topicId = query.topicId;
    if (query.subtopicId) where.subtopicId = query.subtopicId;
    if (query.pyqOnly) where.sourceType = QuestionSourceType.PYQ;
    if (query.pyqYear !== undefined) {
      where.pyqMetadata = { is: { year: query.pyqYear } };
    }
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.tag?.trim()) where.tags = { has: query.tag.trim() };
    return where;
  }

  private contentVisibility(): Prisma.QuestionWhereInput {
    return {
      AND: [
        { exam: { is: visible } },
        { subject: { is: { ...visible, exam: { is: visible } } } },
        {
          academicClass: {
            is: {
              ...visible,
              subject: { is: { ...visible, exam: { is: visible } } },
            },
          },
        },
        {
          chapter: {
            is: {
              ...visible,
              academicClass: {
                is: {
                  ...visible,
                  subject: { is: { ...visible, exam: { is: visible } } },
                },
              },
            },
          },
        },
        {
          topic: {
            is: {
              ...visible,
              chapter: {
                is: {
                  ...visible,
                  academicClass: {
                    is: {
                      ...visible,
                      subject: { is: { ...visible, exam: { is: visible } } },
                    },
                  },
                },
              },
            },
          },
        },
        {
          OR: [
            { subtopicId: null },
            {
              subtopic: {
                is: {
                  ...visible,
                  topic: {
                    is: {
                      ...visible,
                      chapter: {
                        is: {
                          ...visible,
                          academicClass: {
                            is: {
                              ...visible,
                              subject: {
                                is: { ...visible, exam: { is: visible } },
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
          ],
        },
      ],
    };
  }
}
