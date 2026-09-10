-- Phase 8A: personalized daily PCB study-module persistence foundation.
-- This migration is additive and does not alter QBank practice or formal tests.

CREATE TYPE "DailyStudyModuleStatus" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED'
);

CREATE TYPE "DailyStudyTaskType" AS ENUM (
  'QUESTION',
  'FLASHCARD',
  'REVISION',
  'VIDEO'
);

CREATE TYPE "DailyStudyTaskStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'SKIPPED'
);

CREATE TABLE "DailyStudyModule" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studyDate" DATE NOT NULL,
  "status" "DailyStudyModuleStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyStudyModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyStudyTask" (
  "id" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "type" "DailyStudyTaskType" NOT NULL,
  "status" "DailyStudyTaskStatus" NOT NULL DEFAULT 'PENDING',
  "displayOrder" INTEGER NOT NULL,
  "chapterId" TEXT,
  "topicId" TEXT,
  "subtopicId" TEXT,
  "questionId" TEXT,
  "flashcardId" TEXT,
  "revisionItemId" TEXT,
  "videoId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyStudyTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyStudyModule_studentId_studyDate_key"
  ON "DailyStudyModule"("studentId", "studyDate");
CREATE INDEX "DailyStudyModule_studentId_status_studyDate_idx"
  ON "DailyStudyModule"("studentId", "status", "studyDate");

CREATE UNIQUE INDEX "DailyStudyTask_moduleId_subjectId_displayOrder_key"
  ON "DailyStudyTask"("moduleId", "subjectId", "displayOrder");
CREATE INDEX "DailyStudyTask_moduleId_status_idx"
  ON "DailyStudyTask"("moduleId", "status");
CREATE INDEX "DailyStudyTask_subjectId_status_idx"
  ON "DailyStudyTask"("subjectId", "status");
CREATE INDEX "DailyStudyTask_questionId_idx" ON "DailyStudyTask"("questionId");
CREATE INDEX "DailyStudyTask_flashcardId_idx" ON "DailyStudyTask"("flashcardId");
CREATE INDEX "DailyStudyTask_revisionItemId_idx"
  ON "DailyStudyTask"("revisionItemId");
CREATE INDEX "DailyStudyTask_videoId_idx" ON "DailyStudyTask"("videoId");

ALTER TABLE "DailyStudyModule"
  ADD CONSTRAINT "DailyStudyModule_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyStudyTask"
  ADD CONSTRAINT "DailyStudyTask_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "DailyStudyModule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DailyStudyTask_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DailyStudyTask_chapterId_fkey"
    FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DailyStudyTask_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DailyStudyTask_subtopicId_fkey"
    FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DailyStudyTask_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DailyStudyTask_flashcardId_fkey"
    FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DailyStudyTask_revisionItemId_fkey"
    FOREIGN KEY ("revisionItemId") REFERENCES "RevisionItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DailyStudyTask_videoId_fkey"
    FOREIGN KEY ("videoId") REFERENCES "Video"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
