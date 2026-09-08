import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import {
  MediaAssetDto,
  MediaAssetListDto,
  UpdateMediaAssetDto,
} from './media-asset.dto';

@Injectable()
export class MediaAssetsService {
  constructor(private readonly db: PrismaService) {}

  async list(query: MediaAssetListDto = new MediaAssetListDto()) {
    const where: Prisma.MediaAssetWhereInput = {};
    if (query.provider) where.provider = query.provider;
    if (query.mimeType) where.mimeType = query.mimeType;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { provider: { contains: search, mode: 'insensitive' } },
        { externalKey: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.db.$transaction([
      this.db.mediaAsset.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.mediaAsset.count({ where }),
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
    const asset = await this.db.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Media asset not found');
    return asset;
  }

  async create(dto: MediaAssetDto) {
    try {
      return await this.db.mediaAsset.create({
        data: dto as Prisma.MediaAssetUncheckedCreateInput,
      });
    } catch (error) {
      this.rethrowKnownDatabaseError(error);
    }
  }

  async update(id: string, dto: UpdateMediaAssetDto) {
    await this.get(id);
    try {
      return await this.db.mediaAsset.update({
        where: { id },
        data: dto as Prisma.MediaAssetUncheckedUpdateInput,
      });
    } catch (error) {
      this.rethrowKnownDatabaseError(error);
    }
  }

  async assertActiveForAssignment(mediaAssetId: string | null | undefined) {
    if (mediaAssetId === undefined || mediaAssetId === null) return;
    const asset = await this.db.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      select: { id: true, isActive: true },
    });
    if (!asset) {
      throw new BadRequestException({
        code: 'INVALID_MEDIA_ASSET_REFERENCE',
        message: 'The referenced media asset does not exist.',
      });
    }
    if (!asset.isActive) {
      throw new BadRequestException({
        code: 'INACTIVE_MEDIA_ASSET',
        message: 'An inactive media asset cannot be newly assigned.',
      });
    }
  }

  private rethrowKnownDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException({
          code: 'MEDIA_ASSET_CONFLICT',
          message: 'An asset with this provider and external key already exists.',
        });
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Media asset not found');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException({
          code: 'INVALID_MEDIA_ASSET_REFERENCE',
          message: 'The referenced media asset is invalid.',
        });
      }
    }
    throw error;
  }
}
