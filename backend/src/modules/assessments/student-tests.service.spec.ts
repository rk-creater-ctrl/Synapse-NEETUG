import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { StudentTestsService } from './student-tests.service';

describe('StudentTestsService', () => {
  const createService = () => {
    const findMany = jest.fn(
      async (_args: Prisma.TestFindManyArgs): Promise<unknown[]> => [],
    );
    const count = jest.fn(async () => 0);
    const findFirst = jest.fn();
    const dbMock = {
      test: { findMany, count, findFirst },
      $transaction: jest.fn(async (queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };

    return {
      findMany,
      findFirst,
      service: new StudentTestsService(dbMock as unknown as PrismaService),
    };
  };

  it('limits student discovery to published, active, free tests', async () => {
    const { service, findMany } = createService();

    await service.list({});

    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual(
      expect.objectContaining({
        isActive: true,
        isPublished: true,
        isFree: true,
      }),
    );
  });

  it('uses an inclusive start and exclusive end availability window', async () => {
    const { service, findMany } = createService();

    await service.list({});

    const where = findMany.mock.calls[0]?.[0]?.where;
    if (!where) {
      throw new Error('Expected student test discovery to pass a where clause.');
    }
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { availableFrom: null },
            { availableFrom: { lte: expect.any(Date) } },
          ]),
        }),
        expect.objectContaining({
          OR: expect.arrayContaining([
            { availableUntil: null },
            { availableUntil: { gt: expect.any(Date) } },
          ]),
        }),
      ]),
    );
  });

  it('requires visible hierarchy ancestors for student discovery', async () => {
    const { service, findMany } = createService();

    await service.list({});

    const where = findMany.mock.calls[0]?.[0]?.where;
    if (!where) {
      throw new Error('Expected student test discovery to pass a where clause.');
    }
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { exam: { isActive: true, isPublished: true } },
        expect.objectContaining({
          OR: expect.arrayContaining([
            { subjectId: null },
            { subject: { isActive: true, isPublished: true } },
          ]),
        }),
      ]),
    );
  });

  it('does not return question content in test detail', async () => {
    const { service, findFirst } = createService();
    findFirst.mockResolvedValue({
      id: 'test-1',
      title: 'Physics test',
      description: null,
      instructions: null,
      examId: 'exam-1',
      subjectId: null,
      academicClassId: null,
      chapterId: null,
      topicId: null,
      subtopicId: null,
      durationMinutes: 60,
      totalMarks: 4,
      isFree: true,
      availableFrom: null,
      availableUntil: null,
      sections: [
        {
          id: 'section-1',
          title: 'Physics',
          instructions: null,
          displayOrder: 1,
          _count: { questions: 1 },
          question: {
            stem: 'Must never be projected',
            options: [{ isCorrect: true }],
          },
        },
      ],
    });

    const detail = await service.findOne('test-1');

    expect(detail).toEqual(
      expect.objectContaining({
        id: 'test-1',
        totalQuestionCount: 1,
        sections: [
          expect.objectContaining({ questionCount: 1 }),
        ],
      }),
    );
    expect(JSON.stringify(detail)).not.toContain('Must never be projected');
    expect(JSON.stringify(detail)).not.toContain('isCorrect');
  });

  it('does not reveal unavailable or premium test metadata through detail', async () => {
    const { service, findFirst } = createService();

    await expect(service.findOne('locked-test')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const where = findFirst.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        id: 'locked-test',
        isFree: true,
        isActive: true,
        isPublished: true,
      }),
    );
  });
});
