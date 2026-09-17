import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunityMemberRole, CommunityType } from '@prisma/client';

import { CommunityMessagesService } from './community-messages.service';

describe('CommunityMessagesService', () => {
  const now = new Date('2026-09-18T10:00:00.000Z');
  const author = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-author',
    studentProfile: { fullName: 'Asha Student' },
    mentorProfile: null,
    ...overrides,
  });
  const message = (overrides: Record<string, unknown> = {}) => ({
    id: 'message-3',
    communityId: 'community-1',
    content: 'Hello community',
    replyToMessageId: null,
    deletedAt: null,
    createdAt: new Date('2026-09-18T09:30:00.000Z'),
    updatedAt: new Date('2026-09-18T09:30:00.000Z'),
    author: author(),
    ...overrides,
  });
  const membership = (overrides: Record<string, unknown> = {}) => ({
    role: CommunityMemberRole.MEMBER,
    bannedAt: null,
    mutedUntil: null,
    community: { type: CommunityType.GROUP },
    ...overrides,
  });
  let db: Record<string, unknown>;
  let messages: Record<string, jest.Mock>;
  let memberships: Record<string, jest.Mock>;
  let communities: { getForUser: jest.Mock };
  let service: CommunityMessagesService;

  beforeEach(() => {
    messages = {
      create: jest.fn((args: { data: { communityId: string; authorUserId: string; content: string } }) =>
        Promise.resolve(message({
          communityId: args.data.communityId,
          content: args.data.content,
          author: author({ id: args.data.authorUserId }),
        }))),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    };
    memberships = { findUnique: jest.fn() };
    communities = { getForUser: jest.fn().mockResolvedValue({ id: 'community-1' }) };
    db = { communityMessage: messages, communityMembership: memberships };
    service = new CommunityMessagesService(db as never, communities as never);
  });

  it.each([
    CommunityMemberRole.MEMBER,
    CommunityMemberRole.MODERATOR,
    CommunityMemberRole.ADMIN,
    CommunityMemberRole.OWNER,
  ])('allows active GROUP %s memberships to publish', async (role) => {
    memberships.findUnique.mockResolvedValueOnce(membership({ role }));

    await expect(service.create('user-author', 'community-1', { content: ' Hello community ' }, now))
      .resolves.toMatchObject({ content: 'Hello community', author: { displayName: 'Asha Student' } });
    expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { communityId: 'community-1', authorUserId: 'user-author', content: 'Hello community' },
    }));
  });

  it.each([
    CommunityMemberRole.MODERATOR,
    CommunityMemberRole.ADMIN,
    CommunityMemberRole.OWNER,
  ])('allows active CHANNEL %s memberships to publish', async (role) => {
    memberships.findUnique.mockResolvedValueOnce(membership({
      role, community: { type: CommunityType.CHANNEL },
    }));

    await expect(service.create('user-author', 'community-1', { content: 'Announcement' }, now))
      .resolves.toMatchObject({ content: 'Announcement' });
  });

  it('rejects a CHANNEL MEMBER, a non-member, and a banned member from publishing', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(membership({ community: { type: CommunityType.CHANNEL } }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(membership({ bannedAt: new Date('2026-09-18T09:00:00.000Z') }));

    await expect(service.create('user-member', 'community-1', { content: 'Nope' }, now)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create('user-outsider', 'community-1', { content: 'Nope' }, now)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create('user-banned', 'community-1', { content: 'Nope' }, now)).rejects.toBeInstanceOf(ForbiddenException);
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('rejects an active mute but allows an expired mute without mutating membership state', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(membership({ mutedUntil: new Date('2026-09-18T10:01:00.000Z') }))
      .mockResolvedValueOnce(membership({ mutedUntil: new Date('2026-09-18T09:59:00.000Z') }));

    await expect(service.create('user-member', 'community-1', { content: 'Muted' }, now)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create('user-member', 'community-1', { content: 'Allowed after mute expiry' }, now))
      .resolves.toMatchObject({ content: 'Allowed after mute expiry' });
    expect(messages.create).toHaveBeenCalledTimes(1);
  });

  it('rejects blank and over-limit content before message persistence', async () => {
    await expect(service.create('user-author', 'community-1', { content: '   ' }, now))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('user-author', 'community-1', { content: 'x'.repeat(4001) }, now))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(memberships.findUnique).not.toHaveBeenCalled();
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('allows authenticated public history access without requiring membership', async () => {
    messages.findMany.mockResolvedValueOnce([]);

    await expect(service.list('user-reader', 'community-public', {}))
      .resolves.toEqual({ items: [], nextCursor: null });
    expect(communities.getForUser).toHaveBeenCalledWith('user-reader', 'community-public');
    expect(messages.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
  });

  it('allows active private-community members to read history', async () => {
    messages.findMany.mockResolvedValueOnce([message()]);

    const result = await service.list('user-member', 'community-private', { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(communities.getForUser).toHaveBeenCalledWith('user-member', 'community-private');
  });

  it('preserves private-history safe-not-found behavior for non-members and banned rows', async () => {
    communities.getForUser
      .mockRejectedValueOnce(new NotFoundException({ code: 'COMMUNITY_NOT_FOUND' }))
      .mockRejectedValueOnce(new NotFoundException({ code: 'COMMUNITY_NOT_FOUND' }));

    await expect(service.list('user-outsider', 'community-private', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list('user-banned', 'community-private', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(messages.findMany).not.toHaveBeenCalled();
  });

  it('returns deterministic chronological pages without duplicate messages when timestamps collide', async () => {
    const sameTime = new Date('2026-09-18T09:30:00.000Z');
    messages.findMany
      .mockResolvedValueOnce([
        message({ id: 'message-3', createdAt: sameTime }),
        message({ id: 'message-2', createdAt: sameTime }),
        message({ id: 'message-1', createdAt: sameTime }),
      ])
      .mockResolvedValueOnce([message({ id: 'message-1', createdAt: sameTime })]);
    messages.findFirst.mockResolvedValueOnce({ id: 'message-2' });

    const newestPage = await service.list('user-reader', 'community-1', { limit: 2 });
    const olderPage = await service.list('user-reader', 'community-1', { limit: 2, cursor: newestPage.nextCursor! });

    expect(newestPage.items.map((item) => item.id)).toEqual(['message-2', 'message-3']);
    expect(newestPage.nextCursor).toBe('message-2');
    expect(olderPage.items.map((item) => item.id)).toEqual(['message-1']);
    expect(olderPage.nextCursor).toBeNull();
    expect(messages.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: { id: 'message-2' }, skip: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('clamps page size and rejects a malformed or unknown cursor safely', async () => {
    messages.findMany.mockResolvedValueOnce([]);
    await service.list('user-reader', 'community-1', { limit: 500 });
    expect(messages.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));

    messages.findFirst.mockResolvedValueOnce(null);
    await expect(service.list('user-reader', 'community-1', { cursor: 'not-a-community-message' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('redacts deleted content while retaining position, safe author identity, and reply metadata', async () => {
    messages.findMany.mockResolvedValueOnce([
      message({
        id: 'deleted-message',
        content: 'Sensitive deleted content',
        deletedAt: new Date('2026-09-18T09:40:00.000Z'),
        replyToMessageId: 'message-parent',
        author: author({ mentorProfile: { fullName: 'Dr Mentor' }, studentProfile: null }),
      }),
    ]);

    const result = await service.list('user-reader', 'community-1', {});

    expect(result.items[0]).toMatchObject({
      id: 'deleted-message', content: null, isDeleted: true, replyToMessageId: 'message-parent',
      author: { id: 'user-author', displayName: 'Dr Mentor' },
    });
    expect(result.items[0]).not.toHaveProperty('email');
    expect(result.items[0]).not.toHaveProperty('passwordHash');
    expect(result.items[0]).not.toHaveProperty('deletedAt');
  });
});
