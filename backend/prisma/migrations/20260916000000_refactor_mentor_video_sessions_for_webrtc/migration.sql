-- Phase 11 self-hosted WebRTC: replace external-provider room metadata with local call-session state.
CREATE TYPE "MentorVideoSessionStatus_new" AS ENUM ('READY', 'ACTIVE', 'ENDED');

ALTER TABLE "MentorVideoSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "MentorVideoSession"
  ALTER COLUMN "status" TYPE "MentorVideoSessionStatus_new"
  USING 'READY'::"MentorVideoSessionStatus_new";
ALTER TABLE "MentorVideoSession" ALTER COLUMN "status" SET DEFAULT 'READY';

DROP TYPE "MentorVideoSessionStatus";
ALTER TYPE "MentorVideoSessionStatus_new" RENAME TO "MentorVideoSessionStatus";

ALTER TABLE "MentorVideoSession"
  DROP COLUMN "provider",
  DROP COLUMN "providerRoomName",
  DROP COLUMN "providerRoomUrl",
  DROP COLUMN "roomExpiresAt",
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3);
