-- Phase 10E: fixed-duration student mentor-session bookings.

CREATE TYPE "MentorBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "MentorBooking" (
  "id" TEXT NOT NULL,
  "mentorProfileId" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "scheduledStartAt" TIMESTAMP(3) NOT NULL,
  "scheduledEndAt" TIMESTAMP(3) NOT NULL,
  "status" "MentorBookingStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MentorBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MentorBooking_duration_check"
    CHECK ("scheduledEndAt" = "scheduledStartAt" + INTERVAL '15 minutes')
);

CREATE INDEX "MentorBooking_mentorProfileId_scheduledStartAt_idx"
  ON "MentorBooking"("mentorProfileId", "scheduledStartAt");
CREATE INDEX "MentorBooking_studentUserId_scheduledStartAt_idx"
  ON "MentorBooking"("studentUserId", "scheduledStartAt");
CREATE INDEX "MentorBooking_status_idx" ON "MentorBooking"("status");

-- Future cancelled bookings can release their slot without weakening protection
-- for pending or confirmed bookings.
CREATE UNIQUE INDEX "MentorBooking_active_mentor_slot_key"
  ON "MentorBooking"("mentorProfileId", "scheduledStartAt")
  WHERE "status" IN ('PENDING', 'CONFIRMED');

ALTER TABLE "MentorBooking"
  ADD CONSTRAINT "MentorBooking_mentorProfileId_fkey"
    FOREIGN KEY ("mentorProfileId") REFERENCES "MentorProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MentorBooking"
  ADD CONSTRAINT "MentorBooking_studentUserId_fkey"
    FOREIGN KEY ("studentUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
