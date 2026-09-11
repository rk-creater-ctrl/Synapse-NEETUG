-- Phase 9A: durable student study-session persistence foundation.
-- This migration is additive and does not implement timer or analytics behavior.

CREATE TYPE "StudySessionStatus" AS ENUM (
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'ABANDONED'
);

CREATE TYPE "StudySessionContextType" AS ENUM (
  'GENERAL',
  'VIDEO',
  'FLASHCARD',
  'QUESTION_PRACTICE',
  'TEST',
  'REVISION',
  'DAILY_STUDY'
);

CREATE TABLE "StudySession" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" "StudySessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "contextType" "StudySessionContextType" NOT NULL DEFAULT 'GENERAL',
  "subjectId" TEXT,
  "chapterId" TEXT,
  "topicId" TEXT,
  "subtopicId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "abandonedAt" TIMESTAMP(3),
  "lastResumedAt" TIMESTAMP(3),
  "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
  "finalDurationSeconds" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudySession_studentId_startedAt_idx"
  ON "StudySession"("studentId", "startedAt");
CREATE INDEX "StudySession_studentId_status_idx"
  ON "StudySession"("studentId", "status");
CREATE INDEX "StudySession_studentId_completedAt_idx"
  ON "StudySession"("studentId", "completedAt");
CREATE INDEX "StudySession_subjectId_startedAt_idx"
  ON "StudySession"("subjectId", "startedAt");

ALTER TABLE "StudySession"
  ADD CONSTRAINT "StudySession_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StudySession_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StudySession_chapterId_fkey"
    FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StudySession_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StudySession_subtopicId_fkey"
    FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
