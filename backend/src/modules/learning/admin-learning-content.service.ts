import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { MediaAssetsService } from '../media-assets/media-assets.service';
import {
  ContentHierarchy,
  ContentHierarchyService,
} from '../../shared/content/content-hierarchy.service';
import {
  AdminRevisionListDto,
  AdminVideoListDto,
  RevisionDto,
  UpdateRevisionDto,
  UpdateVideoDto,
  VideoDto,
} from './dto';

type Paginated<T> = {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class AdminLearningContentService {
  constructor(
    private readonly db: PrismaService,
    private readonly hierarchy: ContentHierarchyService,
    private readonly mediaAssets: MediaAssetsService,
  ) {}

  async videos(
    query: AdminVideoListDto = new AdminVideoListDto(),
  ): Promise<Paginated<unknown>> {
    const { page, limit } = query;
    const where = this.videoWhere(query);
    const [items, total] = await this.db.$transaction([
      this.db.video.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { displayOrder: 'asc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
      }),
      this.db.video.count({ where }),
    ]);

    return this.paginated(items, page, limit, total);
  }

  async createVideo(dto: VideoDto) {
    await this.hierarchy.validate(this.videoHierarchy(dto));
    await this.mediaAssets.assertActiveForAssignment(dto.mediaAssetId);

    try {
      return await this.db.video.create({
        data: this.videoData(dto) as Prisma.VideoUncheckedCreateInput,
      });
    } catch (error) {
      this.rethrowKnownDatabaseError(error, 'Video');
    }
  }

  async updateVideo(id: string, dto: UpdateVideoDto) {
    const existing = await this.db.video.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Video not found');
    }

    await this.hierarchy.validate(this.videoHierarchy({ ...existing, ...dto }));
    if (dto.mediaAssetId !== undefined) {
      await this.mediaAssets.assertActiveForAssignment(dto.mediaAssetId);
    }

    try {
      return await this.db.video.update({
        where: { id },
        data: this.videoData(dto) as Prisma.VideoUncheckedUpdateInput,
      });
    } catch (error) {
      this.rethrowKnownDatabaseError(error, 'Video');
    }
  }

  async revision(
    query: AdminRevisionListDto = new AdminRevisionListDto(),
  ): Promise<Paginated<unknown>> {
    const { page, limit } = query;
    const where = this.revisionWhere(query);
    const [items, total] = await this.db.$transaction([
      this.db.revisionItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { displayOrder: 'asc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
      }),
      this.db.revisionItem.count({ where }),
    ]);

    return this.paginated(items, page, limit, total);
  }

  async createRevision(dto: RevisionDto) {
    await this.hierarchy.validate(this.revisionHierarchy(dto));

    try {
      return await this.db.revisionItem.create({
        data: this.revisionData(dto) as Prisma.RevisionItemUncheckedCreateInput,
      });
    } catch (error) {
      this.rethrowKnownDatabaseError(error, 'Revision item');
    }
  }

  async updateRevision(id: string, dto: UpdateRevisionDto) {
    const existing = await this.db.revisionItem.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Revision item not found');
    }

    await this.hierarchy.validate(
      this.revisionHierarchy({ ...existing, ...dto }),
    );

    try {
      return await this.db.revisionItem.update({
        where: { id },
        data: this.revisionData(dto) as Prisma.RevisionItemUncheckedUpdateInput,
      });
    } catch (error) {
      this.rethrowKnownDatabaseError(error, 'Revision item');
    }
  }

  private videoWhere(query: AdminVideoListDto): Prisma.VideoWhereInput {
    const where: Prisma.VideoWhereInput = this.hierarchyWhere(query);
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.isPremium !== undefined) where.isFree = !query.isPremium;
    if (query.provider !== undefined) where.provider = query.provider;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { instructorName: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private revisionWhere(
    query: AdminRevisionListDto,
  ): Prisma.RevisionItemWhereInput {
    const where: Prisma.RevisionItemWhereInput = this.hierarchyWhere(query);
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.type !== undefined) where.type = query.type;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private hierarchyWhere(query: {
    examId?: string;
    subjectId?: string;
    classId?: string;
    chapterId?: string;
    topicId?: string;
    subtopicId?: string;
  }): Record<string, string> {
    const where: Record<string, string> = {};
    if (query.examId) where.examId = query.examId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.classId) where.academicClassId = query.classId;
    if (query.chapterId) where.chapterId = query.chapterId;
    if (query.topicId) where.topicId = query.topicId;
    if (query.subtopicId) where.subtopicId = query.subtopicId;
    return where;
  }

  private videoHierarchy(content: ContentHierarchy): ContentHierarchy {
    return {
      examId: content.examId,
      subjectId: content.subjectId,
      academicClassId: content.academicClassId,
      chapterId: content.chapterId,
      topicId: content.topicId,
      subtopicId: content.subtopicId,
    };
  }

  private revisionHierarchy(content: ContentHierarchy): ContentHierarchy {
    return this.videoHierarchy(content);
  }

  private videoData(dto: VideoDto | UpdateVideoDto) {
    const { classId: _classId, type: _type, ...data } = dto;
    return data;
  }

  private revisionData(dto: RevisionDto | UpdateRevisionDto) {
    const { classId: _classId, ...data } = dto;
    return data;
  }

  private paginated<T>(items: T[], page: number, limit: number, total: number) {
    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  private rethrowKnownDatabaseError(error: unknown, resource: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException({
          code: 'CONTENT_CONFLICT',
          message: `${resource} conflicts with an existing record`,
        });
      }
      if (error.code === 'P2003') {
        throw new ConflictException({
          code: 'INVALID_CONTENT_REFERENCE',
          message: 'A referenced academic record no longer exists',
        });
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`${resource} not found`);
      }
    }
    throw error;
  }
}
