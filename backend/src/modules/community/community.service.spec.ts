import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CommunityMemberRole,
  CommunityType,
  CommunityVisibility,
  Prisma,
} from '@prisma/client';

import { CommunityService } from './community.service';

describe('CommunityService', () => {
  const createdAt = new Date('2026-09-17T10:00:00.000Z');
  const community = (overrides: Record<string, unknown> = {}) => ({
    id: 'community-1',
    name: 'NEET Physics',
    description: 'Discuss physics concepts.',
    type: CommunityType.GROUP,
    visibility: CommunityVisibility.PRIVATE,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  });
  const membership = (overrides: Record<string, unknown> = {}) => ({
    id: 'membership-1',
    userId: 'user-member',
    role: CommunityMemberRole.MEMBER,
    mutedUntil: null,
    bannedAt: null,
    createdAt,
    ...overrides,
  });
  let db: Record<string, unknown>;
  let communities: Record<string, jest.Mock>;
  let memberships: Record<string, jest.Mock>;
  let service: CommunityService;

  beforeEach(() => {
    communities = { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() };
    memberships = {
      findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn(),
    };
    db = {
      community: communities,
      communityMembership: memberships,
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((work: unknown) => {
        if (typeof work === 'function') return work({ community: communities });
        return Promise.all(work as Promise<unknown>[]);
      }),
    };
    service = new CommunityService(db as never);
  });

  it('creates the community and its creator OWNER membership in one transaction', async () => {
    communities.create.mockResolvedValueOnce({
      ...community({ name: ' NEET Physics ' }),
      memberships: [{ userId: 'user-owner', role: CommunityMemberRole.OWNER, mutedUntil: null }],
    });

    const result = await service.create('user-owner', {
      name: ' NEET Physics ',
      description: ' Discuss physics concepts. ',
      type: CommunityType.GROUP,
      visibility: CommunityVisibility.PRIVATE,
    });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(communities.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'NEET Physics',
        description: 'Discuss physics concepts.',
        createdByUserId: 'user-owner',
        memberships: { create: { userId: 'user-owner', role: CommunityMemberRole.OWNER } },
      }),
    }));
    expect(result).toMatchObject({ id: 'community-1', membershipRole: CommunityMemberRole.OWNER });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('createdByUserId');
  });

  it('does not bypass the transaction when owner-membership creation fails', async () => {
    (db.$transaction as jest.Mock).mockRejectedValueOnce(new Error('transaction failed'));

    await expect(service.create('user-owner', {
      name: 'NEET Physics',
      type: CommunityType.GROUP,
      visibility: CommunityVisibility.PRIVATE,
    })).rejects.toThrow('transaction failed');
    expect(communities.create).not.toHaveBeenCalled();
  });

  it('rejects blank community names before persistence', async () => {
    await expect(service.create('user-owner', {
      name: '   ',
      type: CommunityType.GROUP,
      visibility: CommunityVisibility.PUBLIC,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('lists only the authenticated user memberships with deterministic ordering', async () => {
    memberships.findMany.mockResolvedValueOnce([
      { role: CommunityMemberRole.MEMBER, mutedUntil: null, community: community({ id: 'community-b', updatedAt: new Date('2026-09-17T09:00:00.000Z') }) },
      { role: CommunityMemberRole.MODERATOR, mutedUntil: null, community: community({ id: 'community-a', updatedAt: new Date('2026-09-17T10:00:00.000Z') }) },
    ]);

    const result = await service.listForUser('user-member');

    expect(memberships.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-member', bannedAt: null }),
    }));
    expect(result.map((item) => item.id)).toEqual(['community-a', 'community-b']);
    expect(result[0]).toMatchObject({ membershipRole: CommunityMemberRole.MODERATOR });
  });

  it('returns a private community only when the authenticated user is a member', async () => {
    communities.findFirst.mockResolvedValueOnce(null);
    await expect(service.getForUser('user-outsider', 'community-private')).rejects.toBeInstanceOf(NotFoundException);

    communities.findFirst.mockResolvedValueOnce({
      ...community(),
      memberships: [{ userId: 'user-member', role: CommunityMemberRole.MEMBER, mutedUntil: new Date('2026-09-17T12:00:00.000Z') }],
    });
    await expect(service.getForUser('user-member', 'community-private')).resolves.toMatchObject({
      id: 'community-1', membershipRole: CommunityMemberRole.MEMBER,
      viewerMembership: {
        userId: 'user-member', role: CommunityMemberRole.MEMBER, mutedUntil: new Date('2026-09-17T12:00:00.000Z'),
      },
    });
    expect(communities.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'community-private',
        OR: expect.arrayContaining([
          expect.objectContaining({ memberships: { some: { userId: 'user-member', bannedAt: null } } }),
        ]),
      }),
    }));
  });

  it('allows authenticated readers to retrieve a public community without exposing membership or user security data', async () => {
    communities.findFirst.mockResolvedValueOnce({
      ...community({ visibility: CommunityVisibility.PUBLIC }),
      memberships: [],
    });

    const result = await service.getForUser('user-reader', 'community-public');

    expect(result).toMatchObject({ id: 'community-1', visibility: CommunityVisibility.PUBLIC });
    expect(result).not.toHaveProperty('membershipRole');
    expect(result).not.toHaveProperty('viewerMembership');
    expect(result).not.toHaveProperty('author');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('discovers only public communities in stable order and includes only active caller membership state', async () => {
    communities.findMany.mockResolvedValueOnce([
      { ...community({ id: 'community-b' }), memberships: [] },
      { ...community({ id: 'community-a' }), memberships: [{ userId: 'user-reader', role: CommunityMemberRole.MODERATOR, mutedUntil: null }] },
    ]);

    const result = await service.discoverPublic('user-reader');

    expect(communities.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { visibility: CommunityVisibility.PUBLIC },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }));
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ membershipRole: CommunityMemberRole.MODERATOR });
  });

  it('joins a public GROUP as MEMBER and makes repeated joins idempotent', async () => {
    communities.findUnique.mockResolvedValue(community({
      type: CommunityType.GROUP,
      visibility: CommunityVisibility.PUBLIC,
    }));
    memberships.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(membership());
    memberships.create.mockResolvedValueOnce(membership());

    await expect(service.joinPublicGroup('user-member', 'community-1'))
      .resolves.toMatchObject({ id: 'community-1', membershipRole: CommunityMemberRole.MEMBER });
    await expect(service.joinPublicGroup('user-member', 'community-1'))
      .resolves.toMatchObject({ id: 'community-1', membershipRole: CommunityMemberRole.MEMBER });
    expect(memberships.create).toHaveBeenCalledTimes(1);
    expect(memberships.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { communityId: 'community-1', userId: 'user-member', role: CommunityMemberRole.MEMBER },
    }));
  });

  it('rejects direct joins to private communities or channels and never restores a banned membership', async () => {
    communities.findUnique.mockResolvedValueOnce(community({ visibility: CommunityVisibility.PRIVATE }));
    await expect(service.joinPublicGroup('user-member', 'private')).rejects.toBeInstanceOf(ForbiddenException);

    communities.findUnique.mockResolvedValueOnce(community({ type: CommunityType.CHANNEL, visibility: CommunityVisibility.PUBLIC }));
    await expect(service.joinPublicGroup('user-member', 'channel')).rejects.toBeInstanceOf(ForbiddenException);

    communities.findUnique.mockResolvedValueOnce(community({ visibility: CommunityVisibility.PUBLIC }));
    memberships.findUnique.mockResolvedValueOnce(membership({ bannedAt: new Date('2026-09-17T11:00:00.000Z') }));
    await expect(service.joinPublicGroup('user-member', 'community-1')).rejects.toBeInstanceOf(ConflictException);
    expect(memberships.create).not.toHaveBeenCalled();
  });

  it('handles a concurrent public join unique conflict without exposing a database error', async () => {
    communities.findUnique.mockResolvedValueOnce(community({ visibility: CommunityVisibility.PUBLIC }));
    memberships.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(membership());
    memberships.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test',
    }));

    await expect(service.joinPublicGroup('user-member', 'community-1'))
      .resolves.toMatchObject({ membershipRole: CommunityMemberRole.MEMBER });
  });

  it('lets active MEMBER and MODERATOR memberships leave without deleting the community, but protects owners and banned records', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(membership())
      .mockResolvedValueOnce(membership({ id: 'membership-moderator', role: CommunityMemberRole.MODERATOR }))
      .mockResolvedValueOnce(membership({ role: CommunityMemberRole.OWNER }))
      .mockResolvedValueOnce(membership({ bannedAt: new Date('2026-09-17T11:00:00.000Z') }));
    memberships.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.leave('user-member', 'community-1')).resolves.toEqual({ communityId: 'community-1', left: true });
    await expect(service.leave('user-member', 'community-1')).resolves.toEqual({ communityId: 'community-1', left: true });
    await expect(service.leave('user-owner', 'community-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.leave('user-banned', 'community-1')).rejects.toBeInstanceOf(ConflictException);
    expect(communities.findUnique).not.toHaveBeenCalled();
  });

  it('allows OWNER and ADMIN to add a new MEMBER, but not a lower role or a banned target', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(membership({ userId: 'owner', role: CommunityMemberRole.OWNER }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(membership({ userId: 'admin', role: CommunityMemberRole.ADMIN }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(membership({ userId: 'member', role: CommunityMemberRole.MEMBER }))
      .mockResolvedValueOnce(membership({ userId: 'owner', role: CommunityMemberRole.OWNER }))
      .mockResolvedValueOnce(membership({ bannedAt: new Date('2026-09-17T11:00:00.000Z') }));
    (db.user as { findUnique: jest.Mock }).findUnique.mockResolvedValue({ id: 'target-user' });
    memberships.create.mockResolvedValue(membership({ userId: 'target-user' }));

    await expect(service.addMember('owner', 'community-1', 'target-user'))
      .resolves.toMatchObject({ userId: 'target-user', role: CommunityMemberRole.MEMBER });
    await expect(service.addMember('admin', 'community-1', 'target-user'))
      .resolves.toMatchObject({ userId: 'target-user', role: CommunityMemberRole.MEMBER });
    await expect(service.addMember('member', 'community-1', 'target-user')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.addMember('owner', 'community-1', 'target-user')).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires an existing target user and maps duplicate add races to a safe conflict', async () => {
    memberships.findUnique.mockResolvedValueOnce(membership({ role: CommunityMemberRole.OWNER }));
    (db.user as { findUnique: jest.Mock }).findUnique.mockResolvedValueOnce(null);
    await expect(service.addMember('owner', 'community-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);

    memberships.findUnique
      .mockResolvedValueOnce(membership({ role: CommunityMemberRole.OWNER }))
      .mockResolvedValueOnce(null);
    (db.user as { findUnique: jest.Mock }).findUnique.mockResolvedValueOnce({ id: 'target-user' });
    memberships.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test',
    }));
    await expect(service.addMember('owner', 'community-1', 'target-user')).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates member identifiers before performing membership management', async () => {
    await expect(service.addMember('owner', 'community-1', '   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(memberships.findUnique).not.toHaveBeenCalled();
  });

  it('lists only safe active members and requires active membership for private member lists', async () => {
    communities.findFirst.mockResolvedValueOnce({ id: 'community-1' });
    memberships.findMany.mockResolvedValueOnce([
      {
        ...membership(),
        user: { studentProfile: { fullName: 'Asha Student' }, mentorProfile: null },
      },
    ]);
    const result = await service.listMembers('user-member', 'community-1');
    expect(result).toEqual([expect.objectContaining({ userId: 'user-member', displayName: 'Asha Student' })]);
    expect(result[0]).not.toHaveProperty('email');
    expect(memberships.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { communityId: 'community-1', bannedAt: null },
    }));

    communities.findFirst.mockResolvedValueOnce(null);
    await expect(service.listMembers('user-outsider', 'private-community')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces owner and admin role hierarchy without allowing owner changes', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(membership({ userId: 'owner', role: CommunityMemberRole.OWNER }))
      .mockResolvedValueOnce(membership({ userId: 'target', role: CommunityMemberRole.MEMBER }))
      .mockResolvedValueOnce(membership({ userId: 'admin', role: CommunityMemberRole.ADMIN }))
      .mockResolvedValueOnce(membership({ userId: 'target', role: CommunityMemberRole.MODERATOR }))
      .mockResolvedValueOnce(membership({ userId: 'admin', role: CommunityMemberRole.ADMIN }))
      .mockResolvedValueOnce(membership({ userId: 'owner', role: CommunityMemberRole.OWNER }))
      .mockResolvedValueOnce(membership({ userId: 'moderator', role: CommunityMemberRole.MODERATOR }));
    memberships.update
      .mockResolvedValueOnce(membership({ userId: 'target', role: CommunityMemberRole.ADMIN }))
      .mockResolvedValueOnce(membership({ userId: 'target', role: CommunityMemberRole.MEMBER }));

    await expect(service.updateMemberRole('owner', 'community-1', 'target', CommunityMemberRole.ADMIN))
      .resolves.toMatchObject({ role: CommunityMemberRole.ADMIN });
    await expect(service.updateMemberRole('admin', 'community-1', 'target', CommunityMemberRole.MEMBER))
      .resolves.toMatchObject({ role: CommunityMemberRole.MEMBER });
    await expect(service.updateMemberRole('admin', 'community-1', 'owner', CommunityMemberRole.MEMBER))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateMemberRole('moderator', 'community-1', 'target', CommunityMemberRole.MEMBER))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces removal hierarchy and scopes removal to the target community membership', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(membership({ userId: 'owner', role: CommunityMemberRole.OWNER }))
      .mockResolvedValueOnce(membership({ userId: 'target', role: CommunityMemberRole.ADMIN }))
      .mockResolvedValueOnce(membership({ userId: 'admin', role: CommunityMemberRole.ADMIN }))
      .mockResolvedValueOnce(membership({ userId: 'target', role: CommunityMemberRole.OWNER }))
      .mockResolvedValueOnce(membership({ userId: 'member', role: CommunityMemberRole.MEMBER }));
    memberships.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.removeMember('owner', 'community-1', 'target'))
      .resolves.toEqual({ communityId: 'community-1', userId: 'target', removed: true });
    await expect(service.removeMember('admin', 'community-1', 'target')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeMember('member', 'community-1', 'target')).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberships.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ communityId: 'community-1', userId: 'target', bannedAt: null }),
    });
  });
});
