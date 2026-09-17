import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CommunityMemberRole,
  CommunityType,
  CommunityVisibility,
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
  let db: Record<string, unknown>;
  let communities: Record<string, jest.Mock>;
  let memberships: Record<string, jest.Mock>;
  let service: CommunityService;

  beforeEach(() => {
    communities = { create: jest.fn(), findFirst: jest.fn() };
    memberships = { findMany: jest.fn() };
    db = {
      community: communities,
      communityMembership: memberships,
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
      memberships: [{ role: CommunityMemberRole.OWNER }],
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
      { role: CommunityMemberRole.MEMBER, community: community({ id: 'community-b', updatedAt: new Date('2026-09-17T09:00:00.000Z') }) },
      { role: CommunityMemberRole.MODERATOR, community: community({ id: 'community-a', updatedAt: new Date('2026-09-17T10:00:00.000Z') }) },
    ]);

    const result = await service.listForUser('user-member');

    expect(memberships.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-member' } }));
    expect(result.map((item) => item.id)).toEqual(['community-a', 'community-b']);
    expect(result[0]).toMatchObject({ membershipRole: CommunityMemberRole.MODERATOR });
  });

  it('returns a private community only when the authenticated user is a member', async () => {
    communities.findFirst.mockResolvedValueOnce(null);
    await expect(service.getForUser('user-outsider', 'community-private')).rejects.toBeInstanceOf(NotFoundException);

    communities.findFirst.mockResolvedValueOnce({
      ...community(),
      memberships: [{ role: CommunityMemberRole.MEMBER }],
    });
    await expect(service.getForUser('user-member', 'community-private')).resolves.toMatchObject({
      id: 'community-1', membershipRole: CommunityMemberRole.MEMBER,
    });
    expect(communities.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'community-private',
        OR: expect.arrayContaining([{ memberships: { some: { userId: 'user-member' } } }]),
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
    expect(result).not.toHaveProperty('author');
    expect(result).not.toHaveProperty('passwordHash');
  });
});
