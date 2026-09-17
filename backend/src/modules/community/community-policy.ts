import { CommunityMemberRole, CommunityType } from '@prisma/client';

export const isCommunityManager = (role: CommunityMemberRole) =>
  role === CommunityMemberRole.OWNER || role === CommunityMemberRole.ADMIN;

export const canManageCommunityRole = (
  actorRole: CommunityMemberRole,
  targetRole: CommunityMemberRole,
  nextRole: CommunityMemberRole,
) => {
  if (targetRole === CommunityMemberRole.OWNER || nextRole === CommunityMemberRole.OWNER) return false;
  if (actorRole === CommunityMemberRole.OWNER) return true;
  return actorRole === CommunityMemberRole.ADMIN
    && (targetRole === CommunityMemberRole.MEMBER || targetRole === CommunityMemberRole.MODERATOR)
    && (nextRole === CommunityMemberRole.MEMBER || nextRole === CommunityMemberRole.MODERATOR);
};

export const canRemoveCommunityMember = (
  actorRole: CommunityMemberRole,
  targetRole: CommunityMemberRole,
) => canManageCommunityRole(actorRole, targetRole, CommunityMemberRole.MEMBER);

export const canCommunityMemberPublish = (
  type: CommunityType,
  role: CommunityMemberRole,
) => type === CommunityType.GROUP || role !== CommunityMemberRole.MEMBER;
