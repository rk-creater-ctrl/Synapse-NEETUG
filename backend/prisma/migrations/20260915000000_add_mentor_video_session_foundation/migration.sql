-- Phase 11B: non-secret provider room metadata for a single mentor booking.

CREATE TYPE "MentorVideoSessionStatus" AS ENUM ('PROVISIONING', 'READY', 'FAILED');

CREATE TABLE "MentorVideoSession" (
  "id" TEXT NOT NULL,
  "mentorBookingId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "MentorVideoSessionStatus" NOT NULL DEFAULT 'PROVISIONING',
  "providerRoomName" TEXT,
  "providerRoomUrl" TEXT,
  "roomExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MentorVideoSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MentorVideoSession_mentorBookingId_key"
  ON "MentorVideoSession"("mentorBookingId");
CREATE INDEX "MentorVideoSession_status_idx" ON "MentorVideoSession"("status");

ALTER TABLE "MentorVideoSession"
  ADD CONSTRAINT "MentorVideoSession_mentorBookingId_fkey"
    FOREIGN KEY ("mentorBookingId") REFERENCES "MentorBooking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
