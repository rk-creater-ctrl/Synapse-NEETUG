import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  CommunityAttachmentStorageService,
  UploadedCommunityAttachment,
} from './community-attachment-storage.service';
import { canCommunityMemberPublish } from './community-policy';
import {
  CommunityMessageHistoryQueryDto,
  CreateCommunityMessageDto,
  CreateCommunityMessageWithAttachmentsDto,
} from './community.dto';
import { CommunityService } from './community.service';
import {
  CommunityMessageReactionState,
  CommunityReactionsService,
} from './community-reactions.service';

const DEFAULT_MESSAGE_PAGE_SIZE = 50;

const messageSelect = {
  id: true,
  communityId: true,
  content: true,
  replyToMessageId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  attachments: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      type: true,
      originalFileName: true,
      mimeType: true,
      sizeBytes: true,
    },
  },
  replyTo: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      attachments: { select: { id: true } },
      author: {
        select: {
          id: true,
          studentProfile: { select: { fullName: true } },
          mentorProfile: { select: { fullName: true } },
        },
      },
    },
  },
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
    private readonly storage: CommunityAttachmentStorageService,
    private readonly reactions: CommunityReactionsService,
  ) {}

  async create(userId: string, communityId: string, dto: CreateCommunityMessageDto, now = new Date()) {
    const content = this.normalizedContent(dto.content);
    if (!content) this.messageRequired();
    await this.assertMayPublish(userId, communityId, now);
    await this.assertReplyTarget(communityId, dto.replyToMessageId);

    const message = await this.db.communityMessage.create({
      data: { communityId, authorUserId: userId, content, replyToMessageId: dto.replyToMessageId ?? null },
      select: messageSelect,
    });
    return this.toResponse(message, { reactions: [], myReaction: null });
  }

  async createWithAttachments(
    userId: string,
    communityId: string,
    dto: CreateCommunityMessageWithAttachmentsDto,
    files: UploadedCommunityAttachment[] | undefined,
    now = new Date(),
  ) {
    const content = this.normalizedContent(dto.content);
    if (!content && (!files || files.length === 0)) this.messageRequired();
    await this.assertMayPublish(userId, communityId, now);
    await this.assertReplyTarget(communityId, dto.replyToMessageId);
    const preparedAttachments = this.storage.prepare(files);
    if (!content && preparedAttachments.length === 0) this.messageRequired();

    const storedAttachments = await this.storage.store(preparedAttachments);
    try {
      const message = await this.db.$transaction((tx) =>
        tx.communityMessage.create({
          data: {
            communityId,
            authorUserId: userId,
            content,
            replyToMessageId: dto.replyToMessageId ?? null,
            attachments: {
              create: storedAttachments.map((attachment, position) => ({ ...attachment, position })),
            },
          },
          select: messageSelect,
        }),
      );
      return this.toResponse(message, { reactions: [], myReaction: null });
    } catch (error) {
      await this.storage.remove(storedAttachments.map((attachment) => attachment.storageKey));
      throw error;
    }
  }

  async readAttachmentForUser(userId: string, attachmentId: string) {
    const attachment = await this.db.communityMessageAttachment.findFirst({
      where: { id: attachmentId, message: { deletedAt: null } },
      select: {
        mimeType: true,
        originalFileName: true,
        storageKey: true,
        type: true,
        message: { select: { communityId: true } },
      },
    });
    if (!attachment) this.attachmentNotFound();

    await this.communities.getForUser(userId, attachment.message.communityId);
    try {
      return {
        buffer: await this.storage.read(attachment.storageKey),
        mimeType: attachment.mimeType,
        fileName: attachment.originalFileName,
        inline: attachment.type === 'IMAGE',
      };
    } catch {
      this.attachmentNotFound();
    }
  }

  private async assertMayPublish(userId: string, communityId: string, now: Date) {
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
    if (membership.mutedUntil && membership.mutedUntil.getTime() > now.getTime()) {
      throw new ForbiddenException({
        code: 'COMMUNITY_MEMBERSHIP_MUTED',
        message: 'This community membership is currently muted.',
      });
    }
    if (!canCommunityMemberPublish(membership.community.type, membership.role)) {
      this.publishForbidden();
    }
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

    const chronologicalMessages = messages.reverse();
    const reactionStates = await this.reactions.getViewerReactionState(
      userId,
      chronologicalMessages.filter((message) => message.deletedAt === null).map((message) => message.id),
    );

    return {
      items: chronologicalMessages.map((message) => this.toResponse(
        message,
        reactionStates.get(message.id) ?? { reactions: [], myReaction: null },
      )),
      nextCursor,
    };
  }

  private toResponse(message: MessageRecord, reactionState: CommunityMessageReactionState) {
    const isDeleted = message.deletedAt !== null;
    return {
      id: message.id,
      communityId: message.communityId,
      content: isDeleted ? null : message.content,
      isDeleted,
      replyToMessageId: message.replyToMessageId,
      replyTo: message.replyTo ? this.toReplyPreview(message.replyTo) : null,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      attachments: isDeleted
        ? []
        : message.attachments.map((attachment) => ({
          id: attachment.id,
          type: attachment.type,
          fileName: attachment.originalFileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          accessUrl: `/api/v1/communities/attachments/${attachment.id}`,
        })),
      reactions: isDeleted ? [] : reactionState.reactions,
      myReaction: isDeleted ? null : reactionState.myReaction,
      author: this.toSafeAuthor(message.author),
    };
  }

  private toReplyPreview(replyTo: NonNullable<MessageRecord['replyTo']>) {
    const isDeleted = replyTo.deletedAt !== null;
    return {
      id: replyTo.id,
      content: isDeleted ? null : replyTo.content,
      isDeleted,
      attachmentCount: isDeleted ? 0 : replyTo.attachments.length,
      author: this.toSafeAuthor(replyTo.author),
    };
  }

  private toSafeAuthor(author: MessageRecord['author']) {
    return {
      id: author.id,
      displayName: author.studentProfile?.fullName
        ?? author.mentorProfile?.fullName
        ?? 'User',
    };
  }

  private async assertReplyTarget(communityId: string, replyToMessageId?: string) {
    if (!replyToMessageId) return;
    const target = await this.db.communityMessage.findFirst({
      where: { id: replyToMessageId, communityId, deletedAt: null },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'COMMUNITY_REPLY_TARGET_NOT_FOUND',
        message: 'Reply target not found.',
      });
    }
  }

  private normalizedContent(value: string | undefined): string | null {
    if (value === undefined) return null;
    if (typeof value !== 'string') this.messageContentInvalid();
    const content = value.trim();
    if (content.length > 4000) this.messageContentInvalid();
    return content || null;
  }

  private messageRequired(): never {
    throw new BadRequestException({
      code: 'COMMUNITY_MESSAGE_CONTENT_INVALID',
      message: 'A message must contain text or at least one attachment.',
    });
  }

  private messageContentInvalid(): never {
    throw new BadRequestException({
      code: 'COMMUNITY_MESSAGE_CONTENT_INVALID',
      message: 'Message content must be between 1 and 4000 characters.',
    });
  }

  private attachmentNotFound(): never {
    throw new NotFoundException({
      code: 'COMMUNITY_ATTACHMENT_NOT_FOUND',
      message: 'Community attachment not found.',
    });
  }

  private publishForbidden(): never {
    throw new ForbiddenException({
      code: 'COMMUNITY_MESSAGE_PUBLISH_FORBIDDEN',
      message: 'You cannot publish messages in this community.',
    });
  }
}
