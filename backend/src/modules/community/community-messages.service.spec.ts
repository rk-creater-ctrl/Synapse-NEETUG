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
    attachments: [],
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
  let attachmentRecords: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;
  let communities: { getForUser: jest.Mock };
  let service: CommunityMessagesService;

  beforeEach(() => {
    messages = {
      create: jest.fn((args: { data: { communityId: string; authorUserId: string; content: string | null } }) =>
        Promise.resolve(message({
          communityId: args.data.communityId,
          content: args.data.content,
          author: author({ id: args.data.authorUserId }),
        }))),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    };
    memberships = { findUnique: jest.fn() };
    attachmentRecords = { findFirst: jest.fn() };
    storage = { prepare: jest.fn(), store: jest.fn(), remove: jest.fn(), read: jest.fn() };
    communities = { getForUser: jest.fn().mockResolvedValue({ id: 'community-1' }) };
    db = {
      communityMessage: messages,
      communityMessageAttachment: attachmentRecords,
      communityMembership: memberships,
      $transaction: jest.fn(
        (work: (tx: { communityMessage: typeof messages }) => unknown) =>
          work({ communityMessage: messages }),
      ),
    };
    service = new CommunityMessagesService(db as never, communities as never, storage as never);
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

  it('creates an attachment-only message after the same publishing authorization and returns safe attachment metadata', async () => {
    const prepared = [{
      type: 'IMAGE', storageKey: '00000000-0000-4000-8000-000000000000.jpg', originalFileName: 'diagram.jpg',
      mimeType: 'image/jpeg', sizeBytes: 128, buffer: Buffer.from([0xff, 0xd8, 0xff]),
    }];
    const stored = prepared.map(({ buffer: _buffer, ...attachment }) => attachment);
    storage.prepare.mockReturnValueOnce(prepared);
    storage.store.mockResolvedValueOnce(stored);
    memberships.findUnique.mockResolvedValueOnce(membership());
    messages.create.mockResolvedValueOnce(message({
      content: null,
      attachments: [{
        id: 'attachment-1', type: 'IMAGE', originalFileName: 'diagram.jpg', mimeType: 'image/jpeg', sizeBytes: 128,
      }],
    }));

    const result = await service.createWithAttachments('user-author', 'community-1', {}, [{
      originalname: 'diagram.jpg', mimetype: 'image/jpeg', size: 128, buffer: Buffer.from([0xff, 0xd8, 0xff]),
    }], now);

    expect(storage.prepare).toHaveBeenCalledTimes(1);
    expect(storage.store).toHaveBeenCalledWith(prepared);
    expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: null, attachments: { create: [{ ...stored[0], position: 0 }] } }),
    }));
    expect(result).toMatchObject({
      content: null,
      attachments: [{ id: 'attachment-1', fileName: 'diagram.jpg', accessUrl: '/api/v1/communities/attachments/attachment-1' }],
    });
  });

  it('rejects an empty attachment message and removes stored files when database persistence fails', async () => {
    await expect(service.createWithAttachments('user-author', 'community-1', {}, [], now))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(memberships.findUnique).not.toHaveBeenCalled();

    const stored = [{
      type: 'DOCUMENT', storageKey: '00000000-0000-4000-8000-000000000000.pdf', originalFileName: 'notes.pdf',
      mimeType: 'application/pdf', sizeBytes: 64,
    }];
    storage.prepare.mockReturnValueOnce([{ ...stored[0], buffer: Buffer.from('%PDF-') }]);
    storage.store.mockResolvedValueOnce(stored);
    memberships.findUnique.mockResolvedValueOnce(membership());
    (db.$transaction as jest.Mock).mockRejectedValueOnce(new Error('database failure'));

    await expect(service.createWithAttachments('user-author', 'community-1', {}, [{
      originalname: 'notes.pdf', mimetype: 'application/pdf', size: 64, buffer: Buffer.from('%PDF-'),
    }], now)).rejects.toThrow('database failure');
    expect(storage.remove).toHaveBeenCalledWith([stored[0].storageKey]);
  });

  it('applies CHANNEL, ban, and mute publishing rules before storing attachments', async () => {
    const prepared = [{
      type: 'DOCUMENT', storageKey: '00000000-0000-4000-8000-000000000000.pdf', originalFileName: 'notes.pdf',
      mimeType: 'application/pdf', sizeBytes: 64, buffer: Buffer.from('%PDF-'),
    }];
    storage.prepare.mockReturnValue(prepared);
    memberships.findUnique
      .mockResolvedValueOnce(membership({ community: { type: CommunityType.CHANNEL } }))
      .mockResolvedValueOnce(membership({ bannedAt: new Date('2026-09-18T09:00:00.000Z') }))
      .mockResolvedValueOnce(membership({ mutedUntil: new Date('2026-09-18T10:01:00.000Z') }));

    const files = [{ originalname: 'notes.pdf', mimetype: 'application/pdf', size: 64, buffer: Buffer.from('%PDF-') }];
    await expect(service.createWithAttachments('member', 'community-1', {}, files, now)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createWithAttachments('banned', 'community-1', {}, files, now)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createWithAttachments('muted', 'community-1', {}, files, now)).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('allows authenticated public history access without requiring membership', async () => {
    messages.findMany.mockResolvedValueOnce([]);

    await expect(service.list('user-reader', 'community-public', {}))
      .resolves.toEqual({ items: [], nextCursor: null });
    expect(communities.getForUser).toHaveBeenCalledWith('user-reader', 'community-public');
    expect(messages.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
    expect(messages.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ attachments: expect.objectContaining({ orderBy: { position: 'asc' } }) }),
    }));
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
        attachments: [{ id: 'attachment-deleted', type: 'DOCUMENT', originalFileName: 'secret.pdf', mimeType: 'application/pdf', sizeBytes: 90 }],
        replyToMessageId: 'message-parent',
        author: author({ mentorProfile: { fullName: 'Dr Mentor' }, studentProfile: null }),
      }),
    ]);

    const result = await service.list('user-reader', 'community-1', {});

    expect(result.items[0]).toMatchObject({
      id: 'deleted-message', content: null, isDeleted: true, replyToMessageId: 'message-parent',
      author: { id: 'user-author', displayName: 'Dr Mentor' },
      attachments: [],
    });
    expect(result.items[0]).not.toHaveProperty('email');
    expect(result.items[0]).not.toHaveProperty('passwordHash');
    expect(result.items[0]).not.toHaveProperty('deletedAt');
  });

  it('authorizes attachment reads through the community read policy and hides deleted or missing attachment records', async () => {
    attachmentRecords.findFirst.mockResolvedValueOnce({
      storageKey: '00000000-0000-4000-8000-000000000000.pdf', mimeType: 'application/pdf',
      originalFileName: 'notes.pdf', type: 'DOCUMENT', message: { communityId: 'community-private' },
    });
    storage.read.mockResolvedValueOnce(Buffer.from('%PDF-'));

    await expect(service.readAttachmentForUser('user-member', 'attachment-1')).resolves.toMatchObject({
      mimeType: 'application/pdf', fileName: 'notes.pdf', inline: false,
    });
    expect(communities.getForUser).toHaveBeenCalledWith('user-member', 'community-private');

    attachmentRecords.findFirst.mockResolvedValueOnce(null);
    await expect(service.readAttachmentForUser('user-outsider', 'attachment-deleted')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not read private attachment bytes when community read authorization is denied', async () => {
    attachmentRecords.findFirst.mockResolvedValueOnce({
      storageKey: '00000000-0000-4000-8000-000000000000.pdf', mimeType: 'application/pdf',
      originalFileName: 'notes.pdf', type: 'DOCUMENT', message: { communityId: 'community-private' },
    });
    communities.getForUser.mockRejectedValueOnce(new NotFoundException({ code: 'COMMUNITY_NOT_FOUND' }));

    await expect(service.readAttachmentForUser('user-outsider', 'attachment-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.read).not.toHaveBeenCalled();
  });
});
