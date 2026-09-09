import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuestionSourceType,
  QuestionType,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import {
  ContentHierarchy,
  ContentHierarchyService,
} from '../../shared/content/content-hierarchy.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import {
  AdminQuestionListDto,
  QuestionDto,
  QuestionOptionDto,
  QuestionPyqMetadataDto,
  UpdateQuestionDto,
} from './questions.dto';

type QuestionWithMetadata = Prisma.QuestionGetPayload<{
  include: { pyqMetadata: true };
}>;

@Injectable()
export class QuestionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly hierarchy: ContentHierarchyService,
    private readonly mediaAssets: MediaAssetsService,
  ) {}

  async list(query: AdminQuestionListDto = new AdminQuestionListDto()) {
    const where = this.listWhere(query);
    const [items, total] = await this.db.$transaction([
      this.db.question.findMany({
        where,
        include: this.adminInclude(),
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
    const question = await this.db.question.findUnique({
      where: { id },
      include: this.adminInclude(),
    });
    if (!question) {
      throw new NotFoundException({
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.',
      });
    }
    return question;
  }

  async create(dto: QuestionDto) {
    this.validateOptions(dto.type, dto.options);
    await this.hierarchy.validate(this.hierarchyFrom(dto));
    await this.mediaAssets.assertActiveForAssignment(dto.mediaAssetId);
    await this.assertSolutionVideo(dto.solutionVideoId, this.hierarchyFrom(dto));
    const pyqMetadata = this.resolvePyqMetadata(dto.sourceType, dto.pyqMetadata);

    try {
      return await this.db.$transaction((tx) =>
        tx.question.create({
          data: {
            ...this.questionData(dto),
            options: { create: this.optionData(dto.options) },
            pyqMetadata: pyqMetadata ? { create: pyqMetadata } : undefined,
          } as Prisma.QuestionCreateInput,
          include: this.adminInclude(),
        }),
      );
    } catch (error) {
      this.rethrowKnownDatabaseError(error);
    }
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const existing = await this.db.question.findUnique({
      where: { id },
      include: { pyqMetadata: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.',
      });
    }

    const effectiveHierarchy = this.hierarchyFrom({ ...existing, ...dto });
    await this.hierarchy.validate(effectiveHierarchy);
    if (dto.options !== undefined) {
      this.validateOptions(dto.type ?? existing.type, dto.options);
    }
    if (dto.mediaAssetId !== undefined) {
      await this.mediaAssets.assertActiveForAssignment(dto.mediaAssetId);
    }
    await this.assertSolutionVideo(
      dto.solutionVideoId !== undefined
        ? dto.solutionVideoId
        : existing.solutionVideoId,
      effectiveHierarchy,
    );

    const sourceType = dto.sourceType ?? existing.sourceType;
    const pyqMetadata = this.resolveEffectivePyqMetadata(
      sourceType,
      dto.pyqMetadata,
      existing,
    );

    try {
      return await this.db.$transaction((tx) =>
        tx.question.update({
          where: { id },
          data: {
            ...this.questionData(dto),
            options: dto.options
              ? { deleteMany: {}, create: this.optionData(dto.options) }
              : undefined,
            pyqMetadata: this.pyqUpdateData(
              sourceType,
              pyqMetadata,
              Boolean(existing.pyqMetadata),
            ),
          } as Prisma.QuestionUpdateInput,
          include: this.adminInclude(),
        }),
      );
    } catch (error) {
      this.rethrowKnownDatabaseError(error);
    }
  }

  private adminInclude() {
    return {
      options: { orderBy: { position: 'asc' as const } },
      pyqMetadata: true,
      mediaAsset: true,
      solutionVideo: true,
    };
  }

  private listWhere(query: AdminQuestionListDto): Prisma.QuestionWhereInput {
    const where: Prisma.QuestionWhereInput = {};
    if (query.examId) where.examId = query.examId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.classId) where.academicClassId = query.classId;
    if (query.chapterId) where.chapterId = query.chapterId;
    if (query.topicId) where.topicId = query.topicId;
    if (query.subtopicId) where.subtopicId = query.subtopicId;
    if (query.sourceType) where.sourceType = query.sourceType;
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.isPremium !== undefined) where.isFree = !query.isPremium;
    if (query.hasMediaAsset !== undefined) {
      where.mediaAssetId = query.hasMediaAsset ? { not: null } : null;
    }
    if (query.hasSolutionVideo !== undefined) {
      where.solutionVideoId = query.hasSolutionVideo ? { not: null } : null;
    }
    if (query.pyqYear !== undefined || query.pyqSourceExam) {
      where.pyqMetadata = {
        is: {
          ...(query.pyqYear !== undefined ? { year: query.pyqYear } : {}),
          ...(query.pyqSourceExam
            ? { sourceExam: this.normalizeKey(query.pyqSourceExam) }
            : {}),
        },
      };
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { stem: { contains: search, mode: 'insensitive' } },
        { explanation: { contains: search, mode: 'insensitive' } },
        { importKey: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private hierarchyFrom(content: ContentHierarchy): ContentHierarchy {
    return {
      examId: content.examId,
      subjectId: content.subjectId,
      academicClassId: content.academicClassId,
      chapterId: content.chapterId,
      topicId: content.topicId,
      subtopicId: content.subtopicId,
    };
  }

  private validateOptions(type: QuestionType, options: QuestionOptionDto[]) {
    if (type !== QuestionType.SINGLE_CORRECT_MCQ) {
      throw new BadRequestException({
        code: 'INVALID_QUESTION_TYPE',
        message: 'Only single-correct MCQ questions are supported.',
      });
    }
    if (!Array.isArray(options) || options.length !== 4) {
      throw new BadRequestException({
        code: 'INVALID_QUESTION_OPTIONS',
        message: 'A single-correct MCQ requires exactly four options.',
      });
    }

    const positions = options.map((option) => option.position);
    if (new Set(positions).size !== 4 || ![1, 2, 3, 4].every((position) => positions.includes(position))) {
      throw new BadRequestException({
        code: 'INVALID_QUESTION_OPTIONS',
        message: 'Option positions must be exactly 1, 2, 3, and 4.',
      });
    }
    if (options.some((option) => !option.text?.trim())) {
      throw new BadRequestException({
        code: 'INVALID_QUESTION_OPTIONS',
        message: 'Every option must contain text.',
      });
    }
    if (options.filter((option) => option.isCorrect).length !== 1) {
      throw new BadRequestException({
        code: 'INVALID_QUESTION_OPTIONS',
        message: 'A single-correct MCQ must have exactly one correct option.',
      });
    }
  }

  private optionData(options: QuestionOptionDto[]) {
    return options.map((option) => ({
      position: option.position,
      text: option.text.trim(),
      isCorrect: option.isCorrect,
    }));
  }

  private questionData(dto: QuestionDto | UpdateQuestionDto) {
    const {
      options: _options,
      pyqMetadata: _pyqMetadata,
      importKey,
      tags,
      stem,
      explanation,
      ...data
    } = dto;
    return {
      ...data,
      ...(stem !== undefined ? { stem: stem.trim() } : {}),
      ...(explanation !== undefined ? { explanation: explanation.trim() } : {}),
      ...(tags !== undefined
        ? { tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))] }
        : {}),
      ...(importKey !== undefined
        ? { importKey: importKey === null ? null : this.optionalKey(importKey) }
        : {}),
    };
  }

  private resolvePyqMetadata(
    sourceType: QuestionSourceType,
    metadata: QuestionPyqMetadataDto | null | undefined,
  ) {
    if (sourceType === QuestionSourceType.CURATED) {
      if (metadata !== undefined && metadata !== null) {
        throw new BadRequestException({
          code: 'INVALID_PYQ_METADATA',
          message: 'Curated questions cannot include PYQ metadata.',
        });
      }
      return undefined;
    }
    if (!metadata) {
      throw new BadRequestException({
        code: 'PYQ_METADATA_REQUIRED',
        message: 'PYQ questions require source exam, year, session, paper, and question number.',
      });
    }
    return this.normalizedPyqMetadata(metadata);
  }

  private resolveEffectivePyqMetadata(
    sourceType: QuestionSourceType,
    incoming: QuestionPyqMetadataDto | null | undefined,
    existing: QuestionWithMetadata,
  ) {
    if (sourceType === QuestionSourceType.CURATED) {
      if (incoming !== undefined && incoming !== null) {
        throw new BadRequestException({
          code: 'INVALID_PYQ_METADATA',
          message: 'Curated questions cannot include PYQ metadata.',
        });
      }
      return undefined;
    }
    if (incoming === null) {
      throw new BadRequestException({
        code: 'PYQ_METADATA_REQUIRED',
        message: 'PYQ questions require source metadata.',
      });
    }
    if (incoming !== undefined) {
      return this.normalizedPyqMetadata(incoming);
    }
    if (!existing.pyqMetadata) {
      throw new BadRequestException({
        code: 'PYQ_METADATA_REQUIRED',
        message: 'PYQ questions require source metadata.',
      });
    }
    return this.normalizedPyqMetadata({
      sourceExam: existing.pyqMetadata.sourceExam,
      year: existing.pyqMetadata.year,
      sessionKey: existing.pyqMetadata.sessionKey,
      paperKey: existing.pyqMetadata.paperKey,
      questionNumber: existing.pyqMetadata.questionNumber,
      sourceNote: existing.pyqMetadata.sourceNote ?? undefined,
    });
  }

  private pyqUpdateData(
    sourceType: QuestionSourceType,
    metadata: ReturnType<QuestionsService['normalizedPyqMetadata']> | undefined,
    hasExistingMetadata: boolean,
  ) {
    if (sourceType === QuestionSourceType.CURATED) {
      return hasExistingMetadata ? { delete: true } : undefined;
    }
    if (!metadata) {
      return undefined;
    }
    return {
      upsert: {
        create: metadata,
        update: metadata,
      },
    };
  }

  private normalizedPyqMetadata(metadata: QuestionPyqMetadataDto) {
    return {
      sourceExam: this.normalizeKey(metadata.sourceExam),
      year: metadata.year,
      sessionKey: this.normalizeKey(metadata.sessionKey),
      paperKey: this.normalizeKey(metadata.paperKey),
      questionNumber: metadata.questionNumber,
      sourceNote: metadata.sourceNote?.trim() || undefined,
    };
  }

  private optionalKey(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_KEY',
        message: 'importKey cannot be empty when supplied.',
      });
    }
    return normalized;
  }

  private normalizeKey(value: string) {
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private async assertSolutionVideo(
    solutionVideoId: string | null | undefined,
    hierarchy: ContentHierarchy,
  ) {
    if (solutionVideoId === undefined || solutionVideoId === null) {
      return;
    }
    const video = await this.db.video.findUnique({
      where: { id: solutionVideoId },
      select: {
        id: true,
        isActive: true,
        isPublished: true,
        examId: true,
        subjectId: true,
        academicClassId: true,
        chapterId: true,
        topicId: true,
        subtopicId: true,
      },
    });
    if (!video) {
      throw new BadRequestException({
        code: 'INVALID_SOLUTION_VIDEO',
        message: 'The solution video does not exist.',
      });
    }
    if (!video.isActive || !video.isPublished) {
      throw new BadRequestException({
        code: 'INACTIVE_SOLUTION_VIDEO',
        message: 'The solution video must be active and published.',
      });
    }
    const matchingHierarchy = video.examId === hierarchy.examId
      && video.subjectId === hierarchy.subjectId
      && video.academicClassId === hierarchy.academicClassId
      && video.chapterId === hierarchy.chapterId
      && video.topicId === hierarchy.topicId
      && (!video.subtopicId || video.subtopicId === hierarchy.subtopicId);
    if (!matchingHierarchy) {
      throw new BadRequestException({
        code: 'INVALID_SOLUTION_VIDEO',
        message: 'The solution video does not match the question hierarchy.',
      });
    }
  }

  private rethrowKnownDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(',')
          : String(error.meta?.target ?? '');
        if (target.includes('importKey')) {
          throw new ConflictException({
            code: 'QUESTION_IMPORT_KEY_CONFLICT',
            message: 'A question with this import key already exists.',
          });
        }
        if (target.includes('sourceExam') || target.includes('QuestionPyqMetadata')) {
          throw new ConflictException({
            code: 'PYQ_METADATA_CONFLICT',
            message: 'A PYQ question with this source identity already exists.',
          });
        }
        throw new ConflictException({
          code: 'QUESTION_CONFLICT',
          message: 'Question data conflicts with an existing record.',
        });
      }
      if (error.code === 'P2003') {
        throw new BadRequestException({
          code: 'INVALID_QUESTION_REFERENCE',
          message: 'A referenced question record no longer exists.',
        });
      }
      if (error.code === 'P2025') {
        throw new NotFoundException({
          code: 'QUESTION_NOT_FOUND',
          message: 'Question not found.',
        });
      }
    }
    throw error;
  }
}
