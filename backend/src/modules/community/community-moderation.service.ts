import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CommunityMemberRole,
  CommunityModerationActionType,
  CommunityReportReason,
  CommunityReportStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  BanCommunityMemberDto,
  CommunityModerationActionsQueryDto,
  CommunityModerationMembersQueryDto,
  CommunityModerationReportsQueryDto,
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

type TerminalCommunityReportStatus = Extract<
  CommunityReportStatus,
  'RESOLVED' | 'DISMISSED'
>;

const safeUserSelect = {
  id: true,
  studentProfile: { select: { fullName: true } },
  mentorProfile: { select: { fullName: true } },
} as const;

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

  async listReports(
    actorUserId: string,
    communityId: string,
    query: CommunityModerationReportsQueryDto,
  ) {
    await this.requireModerator(actorUserId, communityId);
    const limit = this.pageLimit(query.limit);
    const status = query.status ?? CommunityReportStatus.OPEN;
    const cursor = query.cursor
      ? await this.db.communityMessageReport.findFirst({
        where: { id: query.cursor, communityId, status, ...(query.reason ? { reason: query.reason } : {}) },
        select: { id: true, createdAt: true },
      })
      : null;
    if (query.cursor && !cursor) this.invalidCursor();

    const reports = await this.db.communityMessageReport.findMany({
      where: {
        communityId,
        status,
        ...(query.reason ? { reason: query.reason } : {}),
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true, reason: true, details: true, status: true, createdAt: true, resolvedAt: true,
        reporter: { select: safeUserSelect },
        message: {
          select: {
            id: true, content: true, deletedAt: true, createdAt: true,
            author: { select: safeUserSelect },
            attachments: { select: { id: true } },
          },
        },
      },
    });
    const hasNextPage = reports.length > limit;
    const items = reports.slice(0, limit).map((report) => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      reporter: this.toSafeUser(report.reporter),
      message: {
        id: report.message.id,
        content: report.message.deletedAt ? null : report.message.content,
        isDeleted: Boolean(report.message.deletedAt),
        createdAt: report.message.createdAt,
        author: this.toSafeUser(report.message.author),
        attachmentCount: report.message.deletedAt ? 0 : report.message.attachments.length,
      },
    }));
    return { items, nextCursor: hasNextPage ? items.at(-1)?.id ?? null : null };
  }

  async resolveReport(actorUserId: string, communityId: string, reportId: string, now = new Date()) {
    return this.setReportStatus(actorUserId, communityId, reportId, CommunityReportStatus.RESOLVED, now);
  }

  async dismissReport(actorUserId: string, communityId: string, reportId: string, now = new Date()) {
    return this.setReportStatus(actorUserId, communityId, reportId, CommunityReportStatus.DISMISSED, now);
  }

  async listActions(
    actorUserId: string,
    communityId: string,
    query: CommunityModerationActionsQueryDto,
  ) {
    await this.requireModerator(actorUserId, communityId);
    const limit = this.pageLimit(query.limit);
    const filters = {
      communityId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetUserId ? { targetUserId: query.targetUserId } : {}),
    };
    const cursor = query.cursor
      ? await this.db.communityModerationAction.findFirst({
        where: { id: query.cursor, ...filters }, select: { id: true, createdAt: true },
      })
      : null;
    if (query.cursor && !cursor) this.invalidCursor();
    const actions = await this.db.communityModerationAction.findMany({
      where: {
        ...filters,
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true, action: true, reason: true, createdAt: true, targetMessageId: true,
        actor: { select: safeUserSelect },
        targetUser: { select: safeUserSelect },
      },
    });
    const hasNextPage = actions.length > limit;
    const items = actions.slice(0, limit).map((action) => ({
      id: action.id, action: action.action, reason: action.reason, createdAt: action.createdAt,
      targetMessageId: action.targetMessageId,
      actor: this.toSafeUser(action.actor),
      ...(action.targetUser ? { targetUser: this.toSafeUser(action.targetUser) } : {}),
    }));
    return { items, nextCursor: hasNextPage ? items.at(-1)?.id ?? null : null };
  }

  async listModerationMembers(
    actorUserId: string,
    communityId: string,
    query: CommunityModerationMembersQueryDto,
  ) {
    await this.requireModerator(actorUserId, communityId);
    const limit = this.pageLimit(query.limit);
    const cursor = query.cursor
      ? await this.db.communityMembership.findFirst({
        where: { id: query.cursor, communityId }, select: { id: true, createdAt: true },
      })
      : null;
    if (query.cursor && !cursor) this.invalidCursor();
    const memberships = await this.db.communityMembership.findMany({
      where: {
        communityId,
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, userId: true, role: true, mutedUntil: true, bannedAt: true, createdAt: true, user: { select: safeUserSelect } },
    });
    const hasNextPage = memberships.length > limit;
    const items = memberships.slice(0, limit).map((membership) => ({
      userId: membership.userId,
      displayName: this.toSafeUser(membership.user).displayName,
      role: membership.role,
      mutedUntil: membership.mutedUntil,
      bannedAt: membership.bannedAt,
      joinedAt: membership.createdAt,
    }));
    return { items, nextCursor: hasNextPage ? memberships[limit - 1]?.id ?? null : null };
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

  private async setReportStatus(
    actorUserId: string,
    communityId: string,
    reportId: string,
    status: TerminalCommunityReportStatus,
    now: Date,
  ) {
    await this.requireModerator(actorUserId, communityId);
    const report = await this.db.communityMessageReport.findFirst({
      where: { id: reportId, communityId },
      select: { id: true, status: true, resolvedAt: true },
    });
    if (!report) this.reportNotFound();
    if (report.status !== CommunityReportStatus.OPEN) {
      return { id: report.id, status: report.status, resolvedAt: report.resolvedAt, changed: false };
    }
    const updated = await this.db.communityMessageReport.update({
      where: { id: report.id },
      data: { status, resolvedAt: now, resolvedByUserId: actorUserId },
      select: { id: true, status: true, resolvedAt: true },
    });
    return { ...updated, changed: true };
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

  private pageLimit(value?: number) {
    const limit = value ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) this.invalidCursor();
    return limit;
  }

  private toSafeUser(user: {
    id: string;
    studentProfile: { fullName: string } | null;
    mentorProfile: { fullName: string } | null;
  }) {
    return {
      id: user.id,
      displayName: user.studentProfile?.fullName ?? user.mentorProfile?.fullName ?? 'User',
    };
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

  private reportNotFound(): never {
    throw new NotFoundException({ code: 'COMMUNITY_REPORT_NOT_FOUND', message: 'Community report not found.' });
  }

  private invalidCursor(): never {
    throw new BadRequestException({ code: 'COMMUNITY_MODERATION_CURSOR_INVALID', message: 'Moderation cursor or page size is invalid.' });
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
