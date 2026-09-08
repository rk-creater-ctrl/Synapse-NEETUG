import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import { ContentHierarchy, ContentHierarchyService } from '../../shared/content/content-hierarchy.service';
import { AdminFlashcardListDto, FlashcardDto, FlashcardFilterDto, ReviewDto, UpdateFlashcardDto } from './flashcards.dto';

@Injectable()
export class FlashcardsService {
  constructor(
    private readonly db: PrismaService,
    private readonly hierarchy: ContentHierarchyService,
    private readonly mediaAssets: MediaAssetsService,
  ) {}

  private publicWhere(
    query: FlashcardFilterDto,
    includePremium = false,
  ): Prisma.FlashcardWhereInput {
    const where: Prisma.FlashcardWhereInput = {
      isActive: true,
      isPublished: true,
      ...this.contentVisibility(),
    };
    if (!includePremium) where.isPremium = false;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.classId) where.academicClassId = query.classId;
    if (query.chapterId) where.chapterId = query.chapterId;
    if (query.topicId) where.topicId = query.topicId;
    if (query.subtopicId) where.subtopicId = query.subtopicId;
    return where;
  }

  private adminWhere(query: AdminFlashcardListDto): Prisma.FlashcardWhereInput {
    const where: Prisma.FlashcardWhereInput = {};
    if (query.examId) where.examId = query.examId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.classId) where.academicClassId = query.classId;
    if (query.chapterId) where.chapterId = query.chapterId;
    if (query.topicId) where.topicId = query.topicId;
    if (query.subtopicId) where.subtopicId = query.subtopicId;
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.isPremium !== undefined) where.isPremium = query.isPremium;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { frontContent: { contains: query.search, mode: 'insensitive' } },
        { backContent: { contains: query.search, mode: 'insensitive' } },
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

  private writeData(dto: FlashcardDto | UpdateFlashcardDto) {
    const { classId: _classId, limit: _limit, ...data } = dto;
    return data;
  }

  private rethrowKnownDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException({ code: 'CONTENT_CONFLICT', message: 'A conflicting flashcard already exists.' });
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Flashcard not found');
      }
      if (error.code === 'P2003') {
        throw new ConflictException({ code: 'INVALID_CONTENT_REFERENCE', message: 'A referenced academic record does not exist.' });
      }
    }
    throw error;
  }

  list(query: FlashcardFilterDto) {
    return this.db.flashcard.findMany({ where: this.publicWhere(query), orderBy: { sortOrder: 'asc' } });
  }

  async one(id: string) {
    const flashcard = await this.db.flashcard.findFirst({
      where: { id, ...this.publicWhere({}, true) },
    });
    if (!flashcard) throw new NotFoundException('Flashcard not found');
    if (flashcard.isPremium) throw new ForbiddenException({ code: 'PREMIUM_ACCESS_REQUIRED', message: 'This flashcard requires premium access' });
    return flashcard;
  }

  session(query: FlashcardFilterDto) {
    return this.db.flashcard.findMany({ where: this.publicWhere(query), orderBy: { sortOrder: 'asc' }, take: query.limit ?? 20 });
  }

  async review(studentId: string, id: string, dto: ReviewDto) {
    await this.one(id);
    return this.db.flashcardProgress.upsert({
      where: { studentId_flashcardId: { studentId, flashcardId: id } },
      create: { studentId, flashcardId: id, reviewCount: 1, lastResult: dto.result, lastReviewedAt: new Date() },
      update: { reviewCount: { increment: 1 }, lastResult: dto.result, lastReviewedAt: new Date() },
    });
  }

  async adminList(query: AdminFlashcardListDto = new AdminFlashcardListDto()) {
    const where = this.adminWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.db.$transaction([
      this.db.flashcard.findMany({ where, skip, take: query.limit, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }] }),
      this.db.flashcard.count({ where }),
    ]);
    return { items, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async create(dto: FlashcardDto) {
    await this.hierarchy.validate(this.hierarchyFrom(dto));
    await this.mediaAssets.assertActiveForAssignment(dto.mediaAssetId);
    try {
      return await this.db.flashcard.create({ data: this.writeData(dto) as Prisma.FlashcardCreateInput });
    } catch (error) {
      return this.rethrowKnownDatabaseError(error);
    }
  }

  async update(id: string, dto: UpdateFlashcardDto) {
    const existing = await this.db.flashcard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Flashcard not found');
    await this.hierarchy.validate(this.hierarchyFrom({ ...existing, ...dto }));
    if (dto.mediaAssetId !== undefined) {
      await this.mediaAssets.assertActiveForAssignment(dto.mediaAssetId);
    }
    try {
      return await this.db.flashcard.update({ where: { id }, data: this.writeData(dto) as Prisma.FlashcardUpdateInput });
    } catch (error) {
      return this.rethrowKnownDatabaseError(error);
    }
  }

  private contentVisibility(): Prisma.FlashcardWhereInput {
    const visible = { isActive: true, isPublished: true };
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
