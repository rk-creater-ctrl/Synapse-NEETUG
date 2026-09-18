import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CommunityMemberRole,
  CommunityModerationActionType,
  CommunityReportReason,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  BanCommunityMemberDto,
  CreateCommunityMessageReportDto,
  ModerateCommunityMessageDto,
  MuteCommunityMemberDto,
} from './community.dto';
import { canModerateCommunityMember, canModerateCommunityMessage } from './community-policy';
import { CommunityService } from './community.service';

type ModerationMember = {
  id: string;
  userId: string;
  role: CommunityMemberRole;
  mutedUntil: Date | null;
  bannedAt: Date | null;
};

@Injectable()
export class CommunityModerationService {
  constructor(
    private readonly db: PrismaService,
    private readonly communities: CommunityService,
  ) {}

  async reportMessage(
    reporterUserId: string,
    communityId: string,
    messageId: string,
    dto: CreateCommunityMessageReportDto,
  ) {
    await this.communities.getForUser(reporterUserId, communityId);
    const message = await this.db.communityMessage.findFirst({
      where: { id: messageId, communityId, deletedAt: null },
      select: { id: true },
    });
    if (!message) this.reportTargetNotFound();

    const details = this.optionalReason(dto.details);
    try {
      const report = await this.db.communityMessageReport.create({
        data: { communityId, messageId, reporterUserId, reason: dto.reason, details },
        select: { id: true, communityId: true, messageId: true, reason: true, status: true, createdAt: true },
      });
      return report;
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      const existing = await this.db.communityMessageReport.findUnique({
        where: { messageId_reporterUserId: { messageId, reporterUserId } },
        select: { id: true, communityId: true, messageId: true, reason: true, status: true, createdAt: true },
      });
      if (existing) return existing;
      throw new ConflictException({
        code: 'COMMUNITY_REPORT_ALREADY_EXISTS',
        message: 'This message has already been reported by the authenticated user.',
      });
    }
  }

  async deleteMessage(
    actorUserId: string,
    communityId: string,
    messageId: string,
    dto: ModerateCommunityMessageDto,
    now = new Date(),
  ) {
    const actor = await this.requireModerator(actorUserId, communityId);
    const message = await this.db.communityMessage.findFirst({
      where: { id: messageId, communityId },
      select: {
        id: true,
        communityId: true,
        authorUserId: true,
        deletedAt: true,
        community: { select: { createdByUserId: true } },
        author: {
          select: {
            communityMemberships: {
              where: { communityId },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!message) this.moderationTargetNotFound();
    if (message.deletedAt) return { communityId, messageId, deletedAt: message.deletedAt, changed: false };

    const authorRole = message.authorUserId === message.community.createdByUserId
      ? CommunityMemberRole.OWNER
      : message.author.communityMemberships[0]?.role ?? CommunityMemberRole.MEMBER;
    if (!canModerateCommunityMessage(actor.role, authorRole, actorUserId === message.authorUserId)) {
      this.moderationForbidden();
    }

    const reason = this.optionalReason(dto.reason);
    const changed = await this.db.$transaction(async (tx) => {
      const updated = await tx.communityMessage.updateMany({
        where: { id: messageId, communityId, deletedAt: null },
        data: { deletedAt: now },
      });
      if (updated.count === 0) return false;
      await tx.communityModerationAction.create({
        data: {
          communityId,
          actorUserId,
          targetMessageId: messageId,
          action: CommunityModerationActionType.MESSAGE_DELETED,
          reason,
        },
      });
      return true;
    });
    return { communityId, messageId, deletedAt: changed ? now : message.deletedAt ?? now, changed };
  }

  async muteMember(
    actorUserId: string,
    communityId: string,
    targetUserId: string,
    dto: MuteCommunityMemberDto,
    now = new Date(),
  ) {
    const actor = await this.requireModerator(actorUserId, communityId);
    const target = await this.requireModerationTarget(actor, actorUserId, communityId, targetUserId);
    if (target.bannedAt) this.memberBanned();
    const mutedUntil = new Date(now.getTime() + this.boundedMuteDuration(dto.durationMinutes) * 60_000);
    const reason = this.optionalReason(dto.reason);
    await this.mutateMemberWithAudit({
      communityId, actorUserId, targetUserId, targetId: target.id,
      data: { mutedUntil }, action: CommunityModerationActionType.MEMBER_MUTED, reason,
    });
    return { communityId, userId: targetUserId, action: 'MUTED' as const, mutedUntil, changed: true };
  }

  async unmuteMember(actorUserId: string, communityId: string, targetUserId: string) {
    const actor = await this.requireModerator(actorUserId, communityId);
    const target = await this.requireModerationTarget(actor, actorUserId, communityId, targetUserId);
    if (!target.mutedUntil) return { communityId, userId: targetUserId, action: 'UNMUTED' as const, changed: false };
    await this.mutateMemberWithAudit({
      communityId, actorUserId, targetUserId, targetId: target.id,
      data: { mutedUntil: null }, action: CommunityModerationActionType.MEMBER_UNMUTED, reason: null,
    });
    return { communityId, userId: targetUserId, action: 'UNMUTED' as const, changed: true };
  }

  async banMember(
    actorUserId: string,
    communityId: string,
    targetUserId: string,
    dto: BanCommunityMemberDto,
    now = new Date(),
  ) {
    const actor = await this.requireModerator(actorUserId, communityId);
    const target = await this.requireModerationTarget(actor, actorUserId, communityId, targetUserId);
    if (target.bannedAt) return { communityId, userId: targetUserId, action: 'BANNED' as const, changed: false };
    await this.mutateMemberWithAudit({
      communityId, actorUserId, targetUserId, targetId: target.id,
      data: { bannedAt: now, mutedUntil: null }, action: CommunityModerationActionType.MEMBER_BANNED,
      reason: this.optionalReason(dto.reason),
    });
    return { communityId, userId: targetUserId, action: 'BANNED' as const, changed: true };
  }

  async unbanMember(actorUserId: string, communityId: string, targetUserId: string) {
    const actor = await this.requireModerator(actorUserId, communityId);
    const target = await this.requireModerationTarget(actor, actorUserId, communityId, targetUserId);
    if (!target.bannedAt) return { communityId, userId: targetUserId, action: 'UNBANNED' as const, changed: false };
    await this.mutateMemberWithAudit({
      communityId, actorUserId, targetUserId, targetId: target.id,
      data: { bannedAt: null }, action: CommunityModerationActionType.MEMBER_UNBANNED, reason: null,
    });
    return { communityId, userId: targetUserId, action: 'UNBANNED' as const, changed: true };
  }

  private async requireModerator(userId: string, communityId: string): Promise<ModerationMember> {
    const membership = await this.findMembership(communityId, userId);
    if (!membership || membership.bannedAt) this.communityNotFound();
    if (membership.role === CommunityMemberRole.MEMBER) this.moderationForbidden();
    return membership;
  }

  private async requireModerationTarget(
    actor: ModerationMember,
    actorUserId: string,
    communityId: string,
    targetUserId: string,
  ) {
    const target = await this.findMembership(communityId, targetUserId);
    if (!target) this.moderationTargetNotFound();
    if (actorUserId === targetUserId) this.moderationForbidden();
    if (target.role === CommunityMemberRole.OWNER) this.ownerProtected();
    if (!canModerateCommunityMember(actor.role, target.role)) this.moderationForbidden();
    return target;
  }

  private async findMembership(communityId: string, userId: string): Promise<ModerationMember | null> {
    return this.db.communityMembership.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { id: true, userId: true, role: true, mutedUntil: true, bannedAt: true },
    });
  }

  private async mutateMemberWithAudit(input: {
    communityId: string;
    actorUserId: string;
    targetUserId: string;
    targetId: string;
    data: Prisma.CommunityMembershipUpdateInput;
    action: CommunityModerationActionType;
    reason: string | null;
  }) {
    await this.db.$transaction(async (tx) => {
      await tx.communityMembership.update({ where: { id: input.targetId }, data: input.data });
      await tx.communityModerationAction.create({
        data: {
          communityId: input.communityId,
          actorUserId: input.actorUserId,
          targetUserId: input.targetUserId,
          action: input.action,
          reason: input.reason,
        },
      });
    });
  }

  private optionalReason(value?: string) {
    const normalized = value?.trim();
    if (normalized && normalized.length > 1000) {
      throw new BadRequestException({
        code: 'COMMUNITY_MODERATION_REASON_INVALID',
        message: 'Moderation details may not exceed 1000 characters.',
      });
    }
    return normalized || null;
  }

  private boundedMuteDuration(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 10_080) {
      throw new BadRequestException({
        code: 'COMMUNITY_MUTE_DURATION_INVALID',
        message: 'Mute duration must be between 1 minute and 7 days.',
      });
    }
    return value;
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private reportTargetNotFound(): never {
    throw new NotFoundException({ code: 'COMMUNITY_REPORT_TARGET_NOT_FOUND', message: 'Community message not found.' });
  }

  private communityNotFound(): never {
    throw new NotFoundException({ code: 'COMMUNITY_NOT_FOUND', message: 'Community not found.' });
  }

  private moderationTargetNotFound(): never {
    throw new NotFoundException({ code: 'COMMUNITY_MODERATION_TARGET_NOT_FOUND', message: 'Community moderation target not found.' });
  }

  private moderationForbidden(): never {
    throw new ForbiddenException({ code: 'COMMUNITY_MODERATION_FORBIDDEN', message: 'You cannot moderate this community target.' });
  }

  private ownerProtected(): never {
    throw new ForbiddenException({ code: 'COMMUNITY_OWNER_PROTECTED', message: 'Community owners cannot be moderated.' });
  }

  private memberBanned(): never {
    throw new ConflictException({ code: 'COMMUNITY_MEMBER_ALREADY_BANNED', message: 'This community membership is banned.' });
  }
}
