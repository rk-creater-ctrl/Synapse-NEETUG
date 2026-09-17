import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunityMemberRole, CommunityType, CommunityVisibility, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateCommunityDto } from './community.dto';
import { canManageCommunityRole, canRemoveCommunityMember, isCommunityManager } from './community-policy';

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

const membershipSelect = {
  id: true,
  userId: true,
  role: true,
  bannedAt: true,
  createdAt: true,
} as const;

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
      where: { userId, bannedAt: null },
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
          { memberships: { some: { userId, bannedAt: null } } },
        ],
      },
      select: {
        ...communitySelect,
        memberships: {
          where: { userId, bannedAt: null },
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

  async discoverPublic(userId: string) {
    const communities = await this.db.community.findMany({
      where: { visibility: CommunityVisibility.PUBLIC },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        ...communitySelect,
        memberships: {
          where: { userId, bannedAt: null },
          select: { role: true },
        },
      },
    });
    return communities.map((community) => this.toResponse(community, community.memberships[0]?.role));
  }

  async joinPublicGroup(userId: string, communityId: string) {
    const community = await this.findCommunity(communityId);
    if (community.visibility !== CommunityVisibility.PUBLIC || community.type !== CommunityType.GROUP) {
      throw new ForbiddenException({
        code: 'COMMUNITY_JOIN_NOT_ALLOWED',
        message: 'Only public groups can be joined directly.',
      });
    }
    const existing = await this.findMembership(communityId, userId);
    if (existing) {
      if (existing.bannedAt) this.membershipBanned();
      return this.toResponse(community, existing.role);
    }

    try {
      const membership = await this.db.communityMembership.create({
        data: { communityId, userId, role: CommunityMemberRole.MEMBER },
        select: membershipSelect,
      });
      return this.toResponse(community, membership.role);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        const concurrentMembership = await this.findMembership(communityId, userId);
        if (concurrentMembership?.bannedAt) this.membershipBanned();
        if (concurrentMembership) return this.toResponse(community, concurrentMembership.role);
      }
      throw error;
    }
  }

  async leave(userId: string, communityId: string) {
    const membership = await this.findMembership(communityId, userId);
    if (!membership) this.membershipNotFound();
    if (membership!.bannedAt) this.membershipBanned();
    if (membership!.role === CommunityMemberRole.OWNER) {
      throw new ConflictException({
        code: 'COMMUNITY_OWNER_CANNOT_LEAVE',
        message: 'Community ownership must be transferred before the owner can leave.',
      });
    }
    const removed = await this.db.communityMembership.deleteMany({
      where: { id: membership!.id, communityId, userId, bannedAt: null },
    });
    if (removed.count === 0) this.membershipNotFound();
    return { communityId, left: true };
  }

  async addMember(actorUserId: string, communityId: string, targetUserId: string) {
    targetUserId = this.requiredMemberUserId(targetUserId);
    await this.requireManager(actorUserId, communityId);
    const target = await this.db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'COMMUNITY_MEMBER_USER_NOT_FOUND',
        message: 'User not found.',
      });
    }
    const existing = await this.findMembership(communityId, targetUserId);
    if (existing?.bannedAt) this.membershipBanned();
    if (existing) {
      throw new ConflictException({
        code: 'COMMUNITY_ALREADY_MEMBER',
        message: 'User is already a community member.',
      });
    }
    try {
      const membership = await this.db.communityMembership.create({
        data: { communityId, userId: targetUserId, role: CommunityMemberRole.MEMBER },
        select: membershipSelect,
      });
      return this.toMembershipResponse(membership);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException({
          code: 'COMMUNITY_ALREADY_MEMBER',
          message: 'User is already a community member.',
        });
      }
      throw error;
    }
  }

  async listMembers(userId: string, communityId: string) {
    const community = await this.db.community.findFirst({
      where: {
        id: communityId,
        OR: [
          { visibility: CommunityVisibility.PUBLIC },
          { memberships: { some: { userId, bannedAt: null } } },
        ],
      },
      select: { id: true },
    });
    if (!community) this.communityNotFound();

    const memberships = await this.db.communityMembership.findMany({
      where: { communityId, bannedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        ...membershipSelect,
        user: {
          select: {
            studentProfile: { select: { fullName: true } },
            mentorProfile: { select: { fullName: true } },
          },
        },
      },
    });
    return memberships.map((membership) => ({
      ...this.toMembershipResponse(membership),
      displayName: membership.user.studentProfile?.fullName
        ?? membership.user.mentorProfile?.fullName
        ?? 'User',
    }));
  }

  async updateMemberRole(
    actorUserId: string,
    communityId: string,
    targetUserId: string,
    role: CommunityMemberRole,
  ) {
    targetUserId = this.requiredMemberUserId(targetUserId);
    const actor = await this.requireManager(actorUserId, communityId);
    const target = await this.findMembership(communityId, targetUserId);
    if (!target) this.membershipNotFound();
    if (target!.bannedAt) this.membershipBanned();
    if (!canManageCommunityRole(actor.role, target!.role, role)) this.roleChangeForbidden();

    const membership = await this.db.communityMembership.update({
      where: { id: target!.id },
      data: { role },
      select: membershipSelect,
    });
    return this.toMembershipResponse(membership);
  }

  async removeMember(actorUserId: string, communityId: string, targetUserId: string) {
    targetUserId = this.requiredMemberUserId(targetUserId);
    const actor = await this.requireManager(actorUserId, communityId);
    const target = await this.findMembership(communityId, targetUserId);
    if (!target) this.membershipNotFound();
    if (target!.bannedAt) this.membershipBanned();
    if (!canRemoveCommunityMember(actor.role, target!.role)) this.roleChangeForbidden();

    const removed = await this.db.communityMembership.deleteMany({
      where: { id: target!.id, communityId, userId: targetUserId, bannedAt: null },
    });
    if (removed.count === 0) this.membershipNotFound();
    return { communityId, userId: targetUserId, removed: true };
  }

  private async requireManager(userId: string, communityId: string) {
    const membership = await this.findMembership(communityId, userId);
    if (!membership || membership.bannedAt) this.communityNotFound();
    if (!isCommunityManager(membership!.role)) {
      throw new ForbiddenException({
        code: 'COMMUNITY_MEMBER_MANAGEMENT_FORBIDDEN',
        message: 'Insufficient community role.',
      });
    }
    return membership!;
  }

  private async findCommunity(communityId: string) {
    const community = await this.db.community.findUnique({
      where: { id: communityId },
      select: communitySelect,
    });
    if (!community) this.communityNotFound();
    return community!;
  }

  private async findMembership(communityId: string, userId: string) {
    return this.db.communityMembership.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: membershipSelect,
    });
  }

  private toMembershipResponse(
    membership: { userId: string; role: CommunityMemberRole; createdAt: Date },
  ) {
    return {
      userId: membership.userId,
      role: membership.role,
      joinedAt: membership.createdAt,
    };
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private communityNotFound(): never {
    throw new NotFoundException({ code: 'COMMUNITY_NOT_FOUND', message: 'Community not found.' });
  }

  private membershipNotFound(): never {
    throw new NotFoundException({ code: 'COMMUNITY_MEMBERSHIP_NOT_FOUND', message: 'Community membership not found.' });
  }

  private membershipBanned(): never {
    throw new ConflictException({
      code: 'COMMUNITY_MEMBERSHIP_BANNED',
      message: 'This community membership is banned.',
    });
  }

  private roleChangeForbidden(): never {
    throw new ForbiddenException({
      code: 'COMMUNITY_MEMBER_ROLE_FORBIDDEN',
      message: 'This community role change is not allowed.',
    });
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

  private requiredMemberUserId(value: string) {
    const userId = value.trim();
    if (!userId || userId.length > 191) {
      throw new BadRequestException({
        code: 'COMMUNITY_MEMBER_USER_ID_INVALID',
        message: 'Community member user ID is invalid.',
      });
    }
    return userId;
  }
}
