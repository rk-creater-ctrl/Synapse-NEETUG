-- Phase 12E: private community message attachment metadata.

CREATE TYPE "CommunityAttachmentType" AS ENUM ('IMAGE', 'DOCUMENT');

ALTER TABLE "CommunityMessage"
  ALTER COLUMN "content" DROP NOT NULL;

CREATE TABLE "CommunityMessageAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "type" "CommunityAttachmentType" NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunityMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityMessageAttachment_storageKey_key"
  ON "CommunityMessageAttachment"("storageKey");
CREATE UNIQUE INDEX "CommunityMessageAttachment_messageId_position_key"
  ON "CommunityMessageAttachment"("messageId", "position");
CREATE INDEX "CommunityMessageAttachment_messageId_position_idx"
  ON "CommunityMessageAttachment"("messageId", "position");

ALTER TABLE "CommunityMessageAttachment"
  ADD CONSTRAINT "CommunityMessageAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "CommunityMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
