-- Phase 12A: community domain foundation only.

CREATE TYPE "CommunityType" AS ENUM ('GROUP', 'CHANNEL');
CREATE TYPE "CommunityVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "CommunityMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER');

CREATE TABLE "Community" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "CommunityType" NOT NULL,
  "visibility" "CommunityVisibility" NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityMembership" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "CommunityMemberRole" NOT NULL DEFAULT 'MEMBER',
  "mutedUntil" TIMESTAMP(3),
  "bannedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityMessage" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "replyToMessageId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityMembership_communityId_userId_key"
  ON "CommunityMembership"("communityId", "userId");
CREATE INDEX "Community_createdByUserId_createdAt_idx"
  ON "Community"("createdByUserId", "createdAt");
CREATE INDEX "Community_visibility_type_createdAt_idx"
  ON "Community"("visibility", "type", "createdAt");
CREATE INDEX "CommunityMembership_userId_communityId_idx"
  ON "CommunityMembership"("userId", "communityId");
CREATE INDEX "CommunityMembership_communityId_role_idx"
  ON "CommunityMembership"("communityId", "role");
CREATE INDEX "CommunityMessage_communityId_createdAt_id_idx"
  ON "CommunityMessage"("communityId", "createdAt", "id");
CREATE INDEX "CommunityMessage_replyToMessageId_createdAt_id_idx"
  ON "CommunityMessage"("replyToMessageId", "createdAt", "id");
CREATE INDEX "CommunityMessage_authorUserId_createdAt_idx"
  ON "CommunityMessage"("authorUserId", "createdAt");

ALTER TABLE "Community"
  ADD CONSTRAINT "Community_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommunityMembership"
  ADD CONSTRAINT "CommunityMembership_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "Community"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityMessage"
  ADD CONSTRAINT "CommunityMessage_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "Community"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityMessage_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityMessage_replyToMessageId_fkey"
    FOREIGN KEY ("replyToMessageId") REFERENCES "CommunityMessage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
