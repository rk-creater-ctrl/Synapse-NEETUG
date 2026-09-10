import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateTestDto } from './tests.dto';
import { TestsService } from './tests.service';

describe('TestsService', () => {
  const validSections = () => [
    {
      title: 'Physics',
      displayOrder: 1,
      questions: [
        {
          questionId: 'question-1',
          displayOrder: 1,
          marks: 4,
          negativeMarks: 1,
        },
      ],
    },
  ];

  const validDto = (): CreateTestDto => ({
    title: 'Physics mock',
    examId: 'exam-1',
    durationMinutes: 60,
    sections: validSections(),
  });

  it('rejects duplicate question placement before persistence', async () => {
    const db = {} as unknown as PrismaService;
    const service = new TestsService(db);
    const dto = validDto();
    dto.sections[0].questions.push({
      questionId: 'question-1',
      displayOrder: 2,
      marks: 4,
      negativeMarks: 1,
    });

    await expect(service.create(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an invalid availability window before persistence', async () => {
    const db = {} as unknown as PrismaService;
    const service = new TestsService(db);
    const dto = validDto();
    dto.availableFrom = '2026-09-10T10:00:00.000Z';
    dto.availableUntil = '2026-09-10T09:00:00.000Z';

    await expect(service.create(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('derives total marks from test-question marks', async () => {
    let createData: { totalMarks: number } | undefined;
    const tx = {
      test: {
        create: jest.fn(async (args: { data: { totalMarks: number } }) => {
          createData = args.data;
          return { id: 'test-1' };
        }),
        findUniqueOrThrow: jest.fn(async () => ({ id: 'test-1' })),
      },
      testSection: {
        create: jest.fn(async () => ({ id: 'section-1' })),
      },
      testQuestion: {
        createMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const dbMock = {
      exam: { findUnique: jest.fn(async () => ({ id: 'exam-1' })) },
      subject: { findUnique: jest.fn() },
      academicClass: { findUnique: jest.fn() },
      chapter: { findUnique: jest.fn() },
      topic: { findUnique: jest.fn() },
      subtopic: { findUnique: jest.fn() },
      question: {
        findMany: jest.fn(async () => [
          {
            id: 'question-1',
            examId: 'exam-1',
            subjectId: 'subject-1',
            academicClassId: 'class-1',
            chapterId: 'chapter-1',
            topicId: 'topic-1',
            subtopicId: null,
            isActive: true,
            isPublished: true,
          },
        ]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const db = dbMock as unknown as PrismaService;
    const service = new TestsService(db);
    const dto = validDto();
    dto.sections[0].questions.push({
      questionId: 'question-2',
      displayOrder: 2,
      marks: 2,
      negativeMarks: 0.5,
    });
    dbMock.question.findMany = jest.fn(async () => [
      {
        id: 'question-1',
        examId: 'exam-1',
        subjectId: 'subject-1',
        academicClassId: 'class-1',
        chapterId: 'chapter-1',
        topicId: 'topic-1',
        subtopicId: null,
        isActive: true,
        isPublished: true,
      },
      {
        id: 'question-2',
        examId: 'exam-1',
        subjectId: 'subject-1',
        academicClassId: 'class-1',
        chapterId: 'chapter-1',
        topicId: 'topic-1',
        subtopicId: null,
        isActive: true,
        isPublished: true,
      },
    ]);

    await service.create(dto);

    expect(createData?.totalMarks).toBe(6);
  });

  it('protects attempted tests from subsequent mutation', async () => {
    const db = {
      test: {
        findUnique: jest.fn(async () => ({
          id: 'test-1',
          examId: 'exam-1',
          subjectId: null,
          academicClassId: null,
          chapterId: null,
          topicId: null,
          subtopicId: null,
          availableFrom: null,
          availableUntil: null,
          _count: { attempts: 1 },
        })),
      },
    } as unknown as PrismaService;
    const service = new TestsService(db);

    await expect(service.update('test-1', { title: 'Revised' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
