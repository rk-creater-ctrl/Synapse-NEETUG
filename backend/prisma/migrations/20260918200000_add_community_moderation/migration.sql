-- Phase 12G: persistent community reporting and moderation audit records.

CREATE TYPE "CommunityReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'ABUSE', 'MISINFORMATION', 'INAPPROPRIATE_CONTENT', 'OTHER');
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TYPE "CommunityModerationActionType" AS ENUM ('MESSAGE_DELETED', 'MEMBER_MUTED', 'MEMBER_UNMUTED', 'MEMBER_BANNED', 'MEMBER_UNBANNED');

CREATE TABLE "CommunityMessageReport" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "reporterUserId" TEXT NOT NULL,
  "reason" "CommunityReportReason" NOT NULL,
  "details" TEXT,
  "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  CONSTRAINT "CommunityMessageReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityModerationAction" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT,
  "targetMessageId" TEXT,
  "action" "CommunityModerationActionType" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityModerationAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityMessageReport_messageId_reporterUserId_key"
  ON "CommunityMessageReport"("messageId", "reporterUserId");
CREATE INDEX "CommunityMessageReport_communityId_status_createdAt_idx"
  ON "CommunityMessageReport"("communityId", "status", "createdAt");
CREATE INDEX "CommunityMessageReport_reporterUserId_createdAt_idx"
  ON "CommunityMessageReport"("reporterUserId", "createdAt");
CREATE INDEX "CommunityModerationAction_communityId_createdAt_idx"
  ON "CommunityModerationAction"("communityId", "createdAt");
CREATE INDEX "CommunityModerationAction_actorUserId_createdAt_idx"
  ON "CommunityModerationAction"("actorUserId", "createdAt");
CREATE INDEX "CommunityModerationAction_targetUserId_createdAt_idx"
  ON "CommunityModerationAction"("targetUserId", "createdAt");
CREATE INDEX "CommunityModerationAction_targetMessageId_createdAt_idx"
  ON "CommunityModerationAction"("targetMessageId", "createdAt");

ALTER TABLE "CommunityMessageReport"
  ADD CONSTRAINT "CommunityMessageReport_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityMessageReport_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "CommunityMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityMessageReport_reporterUserId_fkey"
    FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityMessageReport_resolvedByUserId_fkey"
    FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommunityModerationAction"
  ADD CONSTRAINT "CommunityModerationAction_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityModerationAction_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityModerationAction_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityModerationAction_targetMessageId_fkey"
    FOREIGN KEY ("targetMessageId") REFERENCES "CommunityMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
