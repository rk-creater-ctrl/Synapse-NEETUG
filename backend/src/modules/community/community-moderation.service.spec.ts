import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CommunityMemberRole,
  CommunityModerationActionType,
  CommunityReportReason,
} from '@prisma/client';

import { CommunityModerationService } from './community-moderation.service';

describe('CommunityModerationService', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  let memberships: Record<string, jest.Mock>;
  let messages: Record<string, jest.Mock>;
  let reports: Record<string, jest.Mock>;
  let audits: Record<string, jest.Mock>;
  let db: Record<string, unknown>;
  let communities: { getForUser: jest.Mock };
  let service: CommunityModerationService;

  const member = (role: CommunityMemberRole, overrides: Record<string, unknown> = {}) => ({
    id: `membership-${role}`, userId: 'user-target', role, mutedUntil: null, bannedAt: null, ...overrides,
  });

  beforeEach(() => {
    memberships = { findUnique: jest.fn(), update: jest.fn() };
    messages = { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    reports = { create: jest.fn(), findUnique: jest.fn() };
    audits = { create: jest.fn() };
    db = {
      communityMembership: memberships,
      communityMessage: messages,
      communityMessageReport: reports,
      communityModerationAction: audits,
      $transaction: jest.fn((work: (tx: { communityMessage: typeof messages; communityMembership: typeof memberships; communityModerationAction: typeof audits }) => unknown) => work({
        communityMessage: messages, communityMembership: memberships, communityModerationAction: audits,
      })),
    };
    communities = { getForUser: jest.fn().mockResolvedValue({ id: 'community-1' }) };
    service = new CommunityModerationService(db as never, communities as never);
  });

  it.each([
    [CommunityMemberRole.OWNER, CommunityMemberRole.ADMIN, true],
    [CommunityMemberRole.OWNER, CommunityMemberRole.MODERATOR, true],
    [CommunityMemberRole.OWNER, CommunityMemberRole.MEMBER, true],
    [CommunityMemberRole.ADMIN, CommunityMemberRole.ADMIN, false],
    [CommunityMemberRole.ADMIN, CommunityMemberRole.MODERATOR, true],
    [CommunityMemberRole.MODERATOR, CommunityMemberRole.MODERATOR, false],
    [CommunityMemberRole.MODERATOR, CommunityMemberRole.MEMBER, true],
    [CommunityMemberRole.MEMBER, CommunityMemberRole.MEMBER, false],
  ])('enforces moderation hierarchy %s -> %s', async (actorRole, targetRole, allowed) => {
    memberships.findUnique
      .mockResolvedValueOnce(member(actorRole, { userId: 'user-actor' }))
      .mockResolvedValueOnce(member(targetRole));

    const operation = service.muteMember('user-actor', 'community-1', 'user-target', { durationMinutes: 10 }, now);
    if (allowed) {
      await expect(operation).resolves.toMatchObject({ action: 'MUTED' });
    } else {
      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('protects owner and self targets from destructive member moderation', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(member(CommunityMemberRole.OWNER, { userId: 'user-actor' }))
      .mockResolvedValueOnce(member(CommunityMemberRole.OWNER));
    await expect(service.banMember('user-actor', 'community-1', 'user-target', {}, now))
      .rejects.toMatchObject({ response: { code: 'COMMUNITY_OWNER_PROTECTED' } });

    memberships.findUnique
      .mockResolvedValueOnce(member(CommunityMemberRole.ADMIN, { userId: 'user-actor' }))
      .mockResolvedValueOnce(member(CommunityMemberRole.ADMIN, { userId: 'user-actor' }));
    await expect(service.muteMember('user-actor', 'community-1', 'user-actor', { durationMinutes: 10 }, now))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports an accessible non-deleted message once without exposing reporter identity', async () => {
    messages.findFirst.mockResolvedValueOnce({ id: 'message-1' });
    reports.create.mockResolvedValueOnce({
      id: 'report-1', communityId: 'community-1', messageId: 'message-1', reason: CommunityReportReason.SPAM,
      status: 'OPEN', createdAt: now,
    });

    const result = await service.reportMessage('user-reporter', 'community-1', 'message-1', { reason: CommunityReportReason.SPAM });

    expect(communities.getForUser).toHaveBeenCalledWith('user-reporter', 'community-1');
    expect(reports.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reporterUserId: 'user-reporter', reason: CommunityReportReason.SPAM }),
    }));
    expect(result).not.toHaveProperty('reporterUserId');
  });

  it('rejects reports for a missing, cross-community, or deleted message after access policy validation', async () => {
    messages.findFirst.mockResolvedValueOnce(null);
    await expect(service.reportMessage('user-reporter', 'community-1', 'message-other', { reason: CommunityReportReason.SPAM }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('soft-deletes a lower-role message and creates its audit row in the same transaction', async () => {
    memberships.findUnique.mockResolvedValueOnce(member(CommunityMemberRole.ADMIN, { userId: 'user-actor' }));
    messages.findFirst.mockResolvedValueOnce({
      id: 'message-1', communityId: 'community-1', authorUserId: 'user-target', deletedAt: null,
      community: { createdByUserId: 'user-owner' }, author: { communityMemberships: [{ role: CommunityMemberRole.MEMBER }] },
    });

    await expect(service.deleteMessage('user-actor', 'community-1', 'message-1', { reason: 'Spam' }, now))
      .resolves.toMatchObject({ changed: true, deletedAt: now });
    expect(messages.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { deletedAt: now } }));
    expect(audits.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: CommunityModerationActionType.MESSAGE_DELETED, reason: 'Spam' }),
    }));
  });

  it('uses server time for a bounded mute, then preserves the membership row while banning and unbanning', async () => {
    memberships.findUnique
      .mockResolvedValueOnce(member(CommunityMemberRole.OWNER, { userId: 'user-actor' }))
      .mockResolvedValueOnce(member(CommunityMemberRole.MEMBER))
      .mockResolvedValueOnce(member(CommunityMemberRole.OWNER, { userId: 'user-actor' }))
      .mockResolvedValueOnce(member(CommunityMemberRole.MEMBER))
      .mockResolvedValueOnce(member(CommunityMemberRole.OWNER, { userId: 'user-actor' }))
      .mockResolvedValueOnce(member(CommunityMemberRole.MEMBER, { bannedAt: now }));

    await expect(service.muteMember('user-actor', 'community-1', 'user-target', { durationMinutes: 10 }, now))
      .resolves.toMatchObject({ mutedUntil: new Date(now.getTime() + 600_000) });
    await service.banMember('user-actor', 'community-1', 'user-target', { reason: 'Repeated spam' }, now);
    await service.unbanMember('user-actor', 'community-1', 'user-target');

    expect(memberships.update).toHaveBeenCalledWith(expect.objectContaining({ data: { bannedAt: now, mutedUntil: null } }));
    expect(memberships.update).toHaveBeenCalledWith(expect.objectContaining({ data: { bannedAt: null } }));
  });
});
