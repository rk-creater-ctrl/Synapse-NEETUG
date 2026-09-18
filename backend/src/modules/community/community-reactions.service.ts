import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunityReactionType, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

export type CommunityReactionSummary = { type: CommunityReactionType; count: number };
export type CommunityMessageReactionState = {
  reactions: CommunityReactionSummary[];
  myReaction: CommunityReactionType | null;
};
export type CommunityReactionBroadcast = {
  messageId: string;
  communityId: string;
  reactions: CommunityReactionSummary[];
};

const reactionOrder: readonly CommunityReactionType[] = [
  CommunityReactionType.LIKE,
  CommunityReactionType.LOVE,
  CommunityReactionType.CELEBRATE,
  CommunityReactionType.INSIGHTFUL,
];

@Injectable()
export class CommunityReactionsService {
  constructor(private readonly db: PrismaService) {}

  async toggle(
    userId: string,
    communityId: string,
    messageId: string,
    type: CommunityReactionType,
    now = new Date(),
  ): Promise<CommunityReactionBroadcast & { myReaction: CommunityReactionType | null }> {
    await this.assertMayReact(userId, communityId, now);
    const message = await this.db.communityMessage.findFirst({
      where: { id: messageId, communityId, deletedAt: null },
      select: { id: true, communityId: true },
    });
    if (!message) this.targetNotFound();

    const existing = await this.db.communityMessageReaction.findUnique({
      where: { messageId_userId: { messageId, userId } },
      select: { id: true, type: true },
    });

    if (existing?.type === type) {
      await this.db.communityMessageReaction.deleteMany({
        where: { id: existing.id, messageId, userId, type },
      });
    } else if (existing) {
      await this.db.communityMessageReaction.update({
        where: { messageId_userId: { messageId, userId } },
        data: { type },
      });
    } else {
      try {
        await this.db.communityMessageReaction.create({ data: { messageId, userId, type } });
      } catch (error) {
        if (!this.isUniqueConstraint(error)) throw error;
        await this.replaceConcurrentReaction(messageId, userId, type);
      }
    }

    const state = await this.getViewerReactionState(userId, [messageId]);
    const reactionState = state.get(messageId) ?? { reactions: [], myReaction: null };
    return { messageId, communityId: message.communityId, ...reactionState };
  }

  async getViewerReactionState(
    userId: string,
    messageIds: string[],
  ): Promise<Map<string, CommunityMessageReactionState>> {
    if (messageIds.length === 0) return new Map();
    const [counts, mine] = await Promise.all([
      this.db.communityMessageReaction.groupBy({
        by: ['messageId', 'type'],
        where: { messageId: { in: messageIds } },
        _count: { _all: true },
      }),
      this.db.communityMessageReaction.findMany({
        where: { messageId: { in: messageIds }, userId },
        select: { messageId: true, type: true },
      }),
    ]);

    const summaries = new Map<string, CommunityReactionSummary[]>();
    for (const count of counts) {
      const current = summaries.get(count.messageId) ?? [];
      current.push({ type: count.type, count: count._count._all });
      summaries.set(count.messageId, current);
    }
    const ownReactions = new Map(mine.map((reaction) => [reaction.messageId, reaction.type]));
    return new Map(messageIds.map((messageId) => [
      messageId,
      {
        reactions: this.orderedSummaries(summaries.get(messageId) ?? []),
        myReaction: ownReactions.get(messageId) ?? null,
      },
    ]));
  }

  private async assertMayReact(userId: string, communityId: string, now: Date) {
    const membership = await this.db.communityMembership.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { bannedAt: true, mutedUntil: true },
    });
    if (!membership || membership.bannedAt) this.reactionForbidden();
    if (membership.mutedUntil && membership.mutedUntil.getTime() > now.getTime()) {
      throw new ForbiddenException({
        code: 'COMMUNITY_MEMBERSHIP_MUTED',
        message: 'This community membership is currently muted.',
      });
    }
  }

  private async replaceConcurrentReaction(messageId: string, userId: string, type: CommunityReactionType) {
    try {
      await this.db.communityMessageReaction.update({
        where: { messageId_userId: { messageId, userId } },
        data: { type },
      });
    } catch (error) {
      if (this.isMissingRecord(error)) {
        try {
          await this.db.communityMessageReaction.create({ data: { messageId, userId, type } });
        } catch (createError) {
          if (!this.isUniqueConstraint(createError)) throw createError;
          await this.db.communityMessageReaction.update({
            where: { messageId_userId: { messageId, userId } },
            data: { type },
          });
        }
        return;
      }
      throw error;
    }
  }

  private orderedSummaries(summaries: CommunityReactionSummary[]) {
    return [...summaries].sort((left, right) => reactionOrder.indexOf(left.type) - reactionOrder.indexOf(right.type));
  }

  private reactionForbidden(): never {
    throw new ForbiddenException({
      code: 'COMMUNITY_REACTION_NOT_ALLOWED',
      message: 'You cannot react to messages in this community.',
    });
  }

  private targetNotFound(): never {
    throw new NotFoundException({
      code: 'COMMUNITY_REACTION_TARGET_NOT_FOUND',
      message: 'Community message not found.',
    });
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private isMissingRecord(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
  }
}
