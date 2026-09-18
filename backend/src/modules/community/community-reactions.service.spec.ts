import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunityReactionType } from '@prisma/client';

import { CommunityReactionsService } from './community-reactions.service';

describe('CommunityReactionsService', () => {
  const now = new Date('2026-09-18T10:00:00.000Z');
  let memberships: Record<string, jest.Mock>;
  let messages: Record<string, jest.Mock>;
  let reactions: Record<string, jest.Mock>;
  let service: CommunityReactionsService;

  beforeEach(() => {
    memberships = { findUnique: jest.fn().mockResolvedValue({ bannedAt: null, mutedUntil: null }) };
    messages = { findFirst: jest.fn().mockResolvedValue({ id: 'message-1', communityId: 'community-1' }) };
    reactions = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'reaction-1' }),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    };
    service = new CommunityReactionsService({
      communityMembership: memberships,
      communityMessage: messages,
      communityMessageReaction: reactions,
    } as never);
  });

  it('creates a first reaction and returns deterministic persisted aggregate state', async () => {
    reactions.groupBy.mockResolvedValueOnce([
      { messageId: 'message-1', type: CommunityReactionType.INSIGHTFUL, _count: { _all: 1 } },
      { messageId: 'message-1', type: CommunityReactionType.LIKE, _count: { _all: 2 } },
    ]);
    reactions.findMany.mockResolvedValueOnce([{ messageId: 'message-1', type: CommunityReactionType.LIKE }]);

    await expect(service.toggle('user-1', 'community-1', 'message-1', CommunityReactionType.LIKE, now))
      .resolves.toEqual({
        messageId: 'message-1', communityId: 'community-1',
        reactions: [
          { type: CommunityReactionType.LIKE, count: 2 },
          { type: CommunityReactionType.INSIGHTFUL, count: 1 },
        ],
        myReaction: CommunityReactionType.LIKE,
      });
    expect(reactions.create).toHaveBeenCalledWith({
      data: { messageId: 'message-1', userId: 'user-1', type: CommunityReactionType.LIKE },
    });
  });

  it('toggles the same reaction off and replaces a different reaction without duplicate records', async () => {
    reactions.findUnique
      .mockResolvedValueOnce({ id: 'reaction-1', type: CommunityReactionType.LIKE })
      .mockResolvedValueOnce({ id: 'reaction-1', type: CommunityReactionType.LIKE });

    await service.toggle('user-1', 'community-1', 'message-1', CommunityReactionType.LOVE, now);
    await service.toggle('user-1', 'community-1', 'message-1', CommunityReactionType.LIKE, now);

    expect(reactions.update).toHaveBeenCalledWith({
      where: { messageId_userId: { messageId: 'message-1', userId: 'user-1' } },
      data: { type: CommunityReactionType.LOVE },
    });
    expect(reactions.deleteMany).toHaveBeenCalledWith({
      where: { id: 'reaction-1', messageId: 'message-1', userId: 'user-1', type: CommunityReactionType.LIKE },
    });
  });

  it('requires an active unmuted membership but permits any active role, including a channel member', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ bannedAt: now, mutedUntil: null })
      .mockResolvedValueOnce({ bannedAt: null, mutedUntil: new Date(now.getTime() + 1) })
      .mockResolvedValueOnce({ bannedAt: null, mutedUntil: new Date(now.getTime() - 1) });

    await expect(service.toggle('user-1', 'community-1', 'message-1', CommunityReactionType.LIKE, now))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.toggle('user-1', 'community-1', 'message-1', CommunityReactionType.LIKE, now))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.toggle('user-1', 'community-1', 'message-1', CommunityReactionType.LIKE, now))
      .rejects.toMatchObject({ response: { code: 'COMMUNITY_MEMBERSHIP_MUTED' } });
    await expect(service.toggle('user-1', 'community-1', 'message-1', CommunityReactionType.LIKE, now))
      .resolves.toMatchObject({ messageId: 'message-1' });
  });

  it('does not allow reactions on a missing, cross-community, or deleted target', async () => {
    messages.findFirst.mockResolvedValueOnce(null);

    await expect(service.toggle('user-1', 'community-1', 'message-other', CommunityReactionType.LIKE, now))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(reactions.findUnique).not.toHaveBeenCalled();
  });
});
