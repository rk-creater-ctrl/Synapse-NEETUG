import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { canCommunityMemberPublish } from './community-policy';
import { CommunityMessageHistoryQueryDto, CreateCommunityMessageDto } from './community.dto';
import { CommunityService } from './community.service';

const DEFAULT_MESSAGE_PAGE_SIZE = 50;

const messageSelect = {
  id: true,
  communityId: true,
  content: true,
  replyToMessageId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      studentProfile: { select: { fullName: true } },
      mentorProfile: { select: { fullName: true } },
    },
  },
} as const;

type MessageRecord = Prisma.CommunityMessageGetPayload<{ select: typeof messageSelect }>;

@Injectable()
export class CommunityMessagesService {
  constructor(
    private readonly db: PrismaService,
    private readonly communities: CommunityService,
  ) {}

  async create(userId: string, communityId: string, dto: CreateCommunityMessageDto, now = new Date()) {
    const content = this.requiredContent(dto.content);
    const membership = await this.db.communityMembership.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: {
        role: true,
        bannedAt: true,
        mutedUntil: true,
        community: { select: { type: true } },
      },
    });
    if (!membership || membership.bannedAt) this.publishForbidden();
    if (membership!.mutedUntil && membership!.mutedUntil.getTime() > now.getTime()) {
      throw new ForbiddenException({
        code: 'COMMUNITY_MEMBERSHIP_MUTED',
        message: 'This community membership is currently muted.',
      });
    }
    if (!canCommunityMemberPublish(membership!.community.type, membership!.role)) {
      this.publishForbidden();
    }

    const message = await this.db.communityMessage.create({
      data: { communityId, authorUserId: userId, content },
      select: messageSelect,
    });
    return this.toResponse(message);
  }

  async list(userId: string, communityId: string, query: CommunityMessageHistoryQueryDto = new CommunityMessageHistoryQueryDto()) {
    await this.communities.getForUser(userId, communityId);
    const limit = Math.min(100, Math.max(1, query.limit ?? DEFAULT_MESSAGE_PAGE_SIZE));
    if (query.cursor) {
      const cursor = await this.db.communityMessage.findFirst({
        where: { id: query.cursor, communityId },
        select: { id: true },
      });
      if (!cursor) {
        throw new BadRequestException({
          code: 'COMMUNITY_MESSAGE_CURSOR_INVALID',
          message: 'Message cursor is invalid for this community.',
        });
      }
    }

    const page = await this.db.communityMessage.findMany({
      where: { communityId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: limit + 1,
      select: messageSelect,
    });
    const hasMore = page.length > limit;
    const messages = page.slice(0, limit);
    const nextCursor = hasMore ? messages[messages.length - 1]?.id ?? null : null;

    return {
      items: messages.reverse().map((message) => this.toResponse(message)),
      nextCursor,
    };
  }

  private toResponse(message: MessageRecord) {
    const isDeleted = message.deletedAt !== null;
    return {
      id: message.id,
      communityId: message.communityId,
      content: isDeleted ? null : message.content,
      isDeleted,
      replyToMessageId: message.replyToMessageId,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      author: {
        id: message.author.id,
        displayName: message.author.studentProfile?.fullName
          ?? message.author.mentorProfile?.fullName
          ?? 'User',
      },
    };
  }

  private requiredContent(value: string) {
    const content = value.trim();
    if (!content || content.length > 4000) {
      throw new BadRequestException({
        code: 'COMMUNITY_MESSAGE_CONTENT_INVALID',
        message: 'Message content must be between 1 and 4000 characters.',
      });
    }
    return content;
  }

  private publishForbidden(): never {
    throw new ForbiddenException({
      code: 'COMMUNITY_MESSAGE_PUBLISH_FORBIDDEN',
      message: 'You cannot publish messages in this community.',
    });
  }
}
