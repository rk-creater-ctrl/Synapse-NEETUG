import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunityMemberRole, CommunityVisibility, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateCommunityDto } from './community.dto';

const communitySelect = {
  id: true,
  name: true,
  description: true,
  type: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
} as const;

const communityWithMembershipSelect = {
  ...communitySelect,
  memberships: { select: { role: true } },
} as const;

type CommunityRecord = Prisma.CommunityGetPayload<{ select: typeof communitySelect }>;
type CommunityWithMembershipRecord = Prisma.CommunityGetPayload<{
  select: typeof communityWithMembershipSelect;
}>;

@Injectable()
export class CommunityService {
  constructor(private readonly db: PrismaService) {}

  async create(userId: string, dto: CreateCommunityDto) {
    const name = this.requiredName(dto.name);
    const description = this.optionalDescription(dto.description);
    const community = await this.db.$transaction((tx) =>
      tx.community.create({
        data: {
          name,
          description,
          type: dto.type,
          visibility: dto.visibility,
          createdByUserId: userId,
          memberships: {
            create: { userId, role: CommunityMemberRole.OWNER },
          },
        },
        select: communityWithMembershipSelect,
      }),
    );
    return this.toResponse(community, community.memberships[0]?.role);
  }

  async listForUser(userId: string) {
    const memberships = await this.db.communityMembership.findMany({
      where: { userId },
      orderBy: { communityId: 'asc' },
      select: {
        role: true,
        community: { select: communitySelect },
      },
    });

    return memberships
      .map((membership) => this.toResponse(membership.community, membership.role))
      .sort((left, right) => {
        const updatedAtComparison = right.updatedAt.getTime() - left.updatedAt.getTime();
        return updatedAtComparison !== 0 ? updatedAtComparison : left.id.localeCompare(right.id);
      });
  }

  async getForUser(userId: string, communityId: string) {
    const community = await this.db.community.findFirst({
      where: {
        id: communityId,
        OR: [
          { visibility: CommunityVisibility.PUBLIC },
          { memberships: { some: { userId } } },
        ],
      },
      select: {
        ...communitySelect,
        memberships: {
          where: { userId },
          select: { role: true },
        },
      },
    });
    if (!community) {
      throw new NotFoundException({
        code: 'COMMUNITY_NOT_FOUND',
        message: 'Community not found.',
      });
    }
    return this.toResponse(community, community.memberships[0]?.role);
  }

  private toResponse(
    community: CommunityRecord | CommunityWithMembershipRecord,
    membershipRole?: CommunityMemberRole,
  ) {
    return {
      id: community.id,
      name: community.name,
      description: community.description,
      type: community.type,
      visibility: community.visibility,
      ...(membershipRole ? { membershipRole } : {}),
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
    };
  }

  private requiredName(value: string) {
    const name = value.trim();
    if (!name || name.length > 160) {
      throw new BadRequestException({
        code: 'COMMUNITY_NAME_INVALID',
        message: 'Community name must be between 1 and 160 characters.',
      });
    }
    return name;
  }

  private optionalDescription(value?: string) {
    const description = value?.trim();
    if (!description) return null;
    if (description.length > 5000) {
      throw new BadRequestException({
        code: 'COMMUNITY_DESCRIPTION_INVALID',
        message: 'Community description must not exceed 5000 characters.',
      });
    }
    return description;
  }
}
