import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  Prisma,
  QuestionDifficulty,
  QuestionSourceType,
  QuestionType,
} from '@prisma/client';
import { QuestionsService } from './questions.service';
import { QuestionDto } from './questions.dto';

const questionOptions = [
  { position: 1, text: 'Option A', isCorrect: false },
  { position: 2, text: 'Option B', isCorrect: true },
  { position: 3, text: 'Option C', isCorrect: false },
  { position: 4, text: 'Option D', isCorrect: false },
];

const questionDto = (): QuestionDto => ({
  type: QuestionType.SINGLE_CORRECT_MCQ,
  sourceType: QuestionSourceType.CURATED,
  stem: 'What is the SI unit of force?',
  explanation: 'Force is measured in newtons.',
  difficulty: QuestionDifficulty.EASY,
  tags: ['mechanics'],
  examId: 'exam-1',
  subjectId: 'subject-1',
  academicClassId: 'class-1',
  chapterId: 'chapter-1',
  topicId: 'topic-1',
  options: questionOptions,
});

function createDb() {
  return {
    $transaction: jest.fn(),
    question: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    video: { findUnique: jest.fn() },
  };
}

describe('QuestionsService', () => {
  let db: ReturnType<typeof createDb>;
  let hierarchy: { validate: jest.Mock };
  let mediaAssets: { assertActiveForAssignment: jest.Mock };
  let service: QuestionsService;

  beforeEach(() => {
    db = createDb();
    hierarchy = { validate: jest.fn().mockResolvedValue(undefined) };
    mediaAssets = { assertActiveForAssignment: jest.fn().mockResolvedValue(undefined) };
    service = new QuestionsService(db as never, hierarchy as never, mediaAssets as never);
    db.$transaction.mockImplementation((input: ((client: typeof db) => Promise<unknown>) | Promise<unknown>[]) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }
      return input(db);
    });
    db.question.create.mockResolvedValue({ id: 'question-1' });
    db.question.update.mockResolvedValue({ id: 'question-1' });
  });

  it('requires exactly four options with positions 1 through 4 and one correct answer', async () => {
    const tooFew = questionDto();
    tooFew.options = tooFew.options.slice(0, 3);
    await expect(service.create(tooFew)).rejects.toBeInstanceOf(BadRequestException);

    const duplicatePosition = questionDto();
    duplicatePosition.options = [
      ...questionOptions.slice(0, 3),
      { position: 3, text: 'Duplicate position', isCorrect: false },
    ];
    await expect(service.create(duplicatePosition)).rejects.toBeInstanceOf(BadRequestException);

    const twoCorrect = questionDto();
    twoCorrect.options = questionOptions.map((option, index) => ({
      ...option,
      isCorrect: index < 2,
    }));
    await expect(service.create(twoCorrect)).rejects.toBeInstanceOf(BadRequestException);

    const emptyOption = questionDto();
    emptyOption.options = questionOptions.map((option, index) => ({
      ...option,
      text: index === 0 ? '   ' : option.text,
    }));
    await expect(service.create(emptyOption)).rejects.toBeInstanceOf(BadRequestException);
    expect(hierarchy.validate).not.toHaveBeenCalled();
  });

  it('validates hierarchy and active media assignment before creating the question', async () => {
    hierarchy.validate.mockRejectedValueOnce(
      new BadRequestException({ code: 'INVALID_CONTENT_HIERARCHY' }),
    );
    await expect(service.create(questionDto())).rejects.toBeInstanceOf(BadRequestException);
    expect(db.question.create).not.toHaveBeenCalled();

    hierarchy.validate.mockResolvedValue(undefined);
    mediaAssets.assertActiveForAssignment.mockRejectedValueOnce(
      new BadRequestException({ code: 'INACTIVE_MEDIA_ASSET' }),
    );
    await expect(service.create({ ...questionDto(), mediaAssetId: 'inactive-asset' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.question.create).not.toHaveBeenCalled();
  });

  it('requires active, published, hierarchy-compatible solution videos', async () => {
    db.video.findUnique.mockResolvedValue({
      id: 'video-1',
      isActive: true,
      isPublished: true,
      examId: 'exam-1',
      subjectId: 'subject-1',
      academicClassId: 'class-1',
      chapterId: 'chapter-1',
      topicId: 'topic-1',
      subtopicId: null,
    });

    await service.create({ ...questionDto(), solutionVideoId: 'video-1' });
    expect(db.question.create).toHaveBeenCalled();

    db.video.findUnique.mockResolvedValueOnce({
      id: 'video-2',
      isActive: true,
      isPublished: false,
      examId: 'exam-1',
      subjectId: 'subject-1',
      academicClassId: 'class-1',
      chapterId: 'chapter-1',
      topicId: 'topic-1',
      subtopicId: null,
    });
    await expect(service.create({ ...questionDto(), solutionVideoId: 'video-2' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INACTIVE_SOLUTION_VIDEO' }),
    });

    db.video.findUnique.mockResolvedValueOnce({
      id: 'video-3',
      isActive: true,
      isPublished: true,
      examId: 'exam-1',
      subjectId: 'subject-1',
      academicClassId: 'class-1',
      chapterId: 'chapter-1',
      topicId: 'different-topic',
      subtopicId: null,
    });
    await expect(service.create({ ...questionDto(), solutionVideoId: 'video-3' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_SOLUTION_VIDEO' }),
    });
  });

  it('requires normalized PYQ metadata and rejects PYQ metadata for curated questions', async () => {
    await expect(service.create({
      ...questionDto(),
      sourceType: QuestionSourceType.PYQ,
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PYQ_METADATA_REQUIRED' }),
    });

    await expect(service.create({
      ...questionDto(),
      pyqMetadata: {
        sourceExam: 'NEET', year: 2024, sessionKey: 'main', paperKey: 'paper-1', questionNumber: 12,
      },
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_PYQ_METADATA' }),
    });
  });

  it('creates PYQ metadata atomically with normalized source keys', async () => {
    const dto = {
      ...questionDto(),
      sourceType: QuestionSourceType.PYQ,
      pyqMetadata: {
        sourceExam: ' neet ', year: 2024, sessionKey: ' main ', paperKey: ' paper a ', questionNumber: 12,
      },
    };

    await service.create(dto);

    expect(db.question.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        pyqMetadata: {
          create: expect.objectContaining({ sourceExam: 'NEET', sessionKey: 'MAIN', paperKey: 'PAPER A' }),
        },
      }),
    }));
  });

  it('uses the effective hierarchy on update and removes PYQ metadata when switched to curated', async () => {
    db.question.findUnique.mockResolvedValue({
      id: 'question-1',
      ...questionDto(),
      sourceType: QuestionSourceType.PYQ,
      solutionVideoId: null,
      pyqMetadata: {
        sourceExam: 'NEET', year: 2024, sessionKey: 'MAIN', paperKey: 'PAPER A', questionNumber: 12,
      },
    });

    await service.update('question-1', {
      sourceType: QuestionSourceType.CURATED,
      isPublished: false,
      chapterId: 'chapter-2',
    });

    expect(hierarchy.validate).toHaveBeenCalledWith(expect.objectContaining({
      chapterId: 'chapter-2',
      topicId: 'topic-1',
    }));
    expect(db.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceType: QuestionSourceType.CURATED,
        isPublished: false,
        pyqMetadata: { delete: true },
      }),
    }));
  });

  it('creates PYQ metadata during a curated-to-PYQ update and replaces supplied options atomically', async () => {
    db.question.findUnique.mockResolvedValue({
      id: 'question-1',
      ...questionDto(),
      sourceType: QuestionSourceType.CURATED,
      solutionVideoId: null,
      pyqMetadata: null,
    });

    await service.update('question-1', {
      sourceType: QuestionSourceType.PYQ,
      options: questionOptions,
      pyqMetadata: {
        sourceExam: 'NEET', year: 2024, sessionKey: 'MAIN', paperKey: 'A', questionNumber: 1,
      },
    });

    expect(db.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        options: expect.objectContaining({ deleteMany: {}, create: expect.any(Array) }),
        pyqMetadata: expect.objectContaining({ upsert: expect.any(Object) }),
      }),
    }));
  });

  it('returns normalized admin pagination and preserves explicit false filters', async () => {
    db.question.findMany.mockResolvedValue([{ id: 'question-1' }]);
    db.question.count.mockResolvedValue(21);

    await expect(service.list({
      page: 2,
      limit: 10,
      isPublished: false,
      isActive: false,
      isPremium: true,
      sourceType: QuestionSourceType.PYQ,
      pyqYear: 2024,
      pyqSourceExam: 'neet',
    })).resolves.toEqual({
      items: [{ id: 'question-1' }],
      meta: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });

    expect(db.question.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: expect.objectContaining({
        isPublished: false,
        isActive: false,
        isFree: false,
        sourceType: QuestionSourceType.PYQ,
        pyqMetadata: { is: { year: 2024, sourceExam: 'NEET' } },
      }),
    }));
  });

  it('maps import-key and PYQ source uniqueness conflicts to clean errors', async () => {
    const importKeyConflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: '6.19.0', meta: { target: ['importKey'] },
    });
    db.question.create.mockRejectedValueOnce(importKeyConflict);
    await expect(service.create({ ...questionDto(), importKey: 'curated-force-1' })).rejects.toBeInstanceOf(ConflictException);

    const pyqConflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: '6.19.0', meta: { target: ['sourceExam', 'year'] },
    });
    db.question.create.mockRejectedValueOnce(pyqConflict);
    await expect(service.create({
      ...questionDto(),
      sourceType: QuestionSourceType.PYQ,
      pyqMetadata: { sourceExam: 'NEET', year: 2024, sessionKey: 'MAIN', paperKey: 'A', questionNumber: 1 },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps explanation and correct-option fields available to the CMS service', async () => {
    db.question.findUnique.mockResolvedValue({
      id: 'question-1',
      stem: 'What is force?',
      explanation: 'Force is mass × acceleration.',
      options: [{ id: 'option-2', position: 2, text: 'Mass × acceleration', isCorrect: true }],
      pyqMetadata: null,
    });

    const result = await service.get('question-1');

    expect(result).toEqual(expect.objectContaining({
      explanation: 'Force is mass × acceleration.',
      options: [expect.objectContaining({ isCorrect: true })],
    }));
    expect(db.question.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ options: expect.any(Object) }),
    }));
  });
});
