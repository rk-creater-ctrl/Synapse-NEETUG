-- Phase 12F: one persistent reaction per user per community message.

CREATE TYPE "CommunityReactionType" AS ENUM ('LIKE', 'LOVE', 'CELEBRATE', 'INSIGHTFUL');

CREATE TABLE "CommunityMessageReaction" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "CommunityReactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunityMessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityMessageReaction_messageId_userId_key"
  ON "CommunityMessageReaction"("messageId", "userId");
CREATE INDEX "CommunityMessageReaction_messageId_type_idx"
  ON "CommunityMessageReaction"("messageId", "type");
CREATE INDEX "CommunityMessageReaction_userId_messageId_idx"
  ON "CommunityMessageReaction"("userId", "messageId");

ALTER TABLE "CommunityMessageReaction"
  ADD CONSTRAINT "CommunityMessageReaction_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "CommunityMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityMessageReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
