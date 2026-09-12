-- Phase 10C: recurring weekly mentor availability only.
-- dayOfWeek uses 0 = Sunday through 6 = Saturday.

ALTER TABLE "MentorProfile"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE "MentorAvailability" (
  "id" TEXT NOT NULL,
  "mentorProfileId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MentorAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MentorAvailability_dayOfWeek_check" CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6),
  CONSTRAINT "MentorAvailability_startMinute_check" CHECK ("startMinute" >= 0 AND "startMinute" < 1440),
  CONSTRAINT "MentorAvailability_endMinute_check" CHECK ("endMinute" > 0 AND "endMinute" <= 1440),
  CONSTRAINT "MentorAvailability_time_range_check" CHECK ("startMinute" < "endMinute")
);

CREATE UNIQUE INDEX "MentorAvailability_mentorProfileId_dayOfWeek_startMinute_endMinute_key"
  ON "MentorAvailability"("mentorProfileId", "dayOfWeek", "startMinute", "endMinute");
CREATE INDEX "MentorAvailability_mentorProfileId_dayOfWeek_idx"
  ON "MentorAvailability"("mentorProfileId", "dayOfWeek");

ALTER TABLE "MentorAvailability"
  ADD CONSTRAINT "MentorAvailability_mentorProfileId_fkey"
    FOREIGN KEY ("mentorProfileId") REFERENCES "MentorProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
