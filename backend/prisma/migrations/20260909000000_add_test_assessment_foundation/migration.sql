-- Phase 7A: formal test/assessment persistence foundation.
-- This migration is additive and intentionally does not alter Phase 6 QBank practice data.

CREATE TYPE "TestAttemptStatus" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'AUTO_SUBMITTED',
  'ABANDONED'
);

CREATE TABLE "Test" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "instructions" TEXT,
  "examId" TEXT NOT NULL,
  "subjectId" TEXT,
  "academicClassId" TEXT,
  "chapterId" TEXT,
  "topicId" TEXT,
  "subtopicId" TEXT,
  "durationMinutes" INTEGER NOT NULL,
  "totalMarks" DOUBLE PRECISION NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isFree" BOOLEAN NOT NULL DEFAULT false,
  "availableFrom" TIMESTAMP(3),
  "availableUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestSection" (
  "id" TEXT NOT NULL,
  "testId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "displayOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TestSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestQuestion" (
  "id" TEXT NOT NULL,
  "testId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "marks" DOUBLE PRECISION NOT NULL,
  "negativeMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TestQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestAttempt" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "testId" TEXT NOT NULL,
  "status" "TestAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "autoSubmittedAt" TIMESTAMP(3),
  "score" DOUBLE PRECISION,
  "correctCount" INTEGER,
  "incorrectCount" INTEGER,
  "unansweredCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TestAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestAttemptAnswer" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "testQuestionId" TEXT NOT NULL,
  "selectedOptionId" TEXT,
  "isMarkedForReview" BOOLEAN NOT NULL DEFAULT false,
  "answeredAt" TIMESTAMP(3),
  "elapsedSeconds" INTEGER,
  "isCorrect" BOOLEAN,
  "awardedMarks" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TestAttemptAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestSection_testId_displayOrder_key"
  ON "TestSection"("testId", "displayOrder");
CREATE UNIQUE INDEX "TestQuestion_testId_questionId_key"
  ON "TestQuestion"("testId", "questionId");
CREATE UNIQUE INDEX "TestQuestion_sectionId_displayOrder_key"
  ON "TestQuestion"("sectionId", "displayOrder");
CREATE UNIQUE INDEX "TestAttemptAnswer_attemptId_testQuestionId_key"
  ON "TestAttemptAnswer"("attemptId", "testQuestionId");

CREATE INDEX "Test_examId_isActive_isPublished_idx"
  ON "Test"("examId", "isActive", "isPublished");
CREATE INDEX "Test_subjectId_academicClassId_isActive_isPublished_idx"
  ON "Test"("subjectId", "academicClassId", "isActive", "isPublished");
CREATE INDEX "Test_chapterId_topicId_isActive_isPublished_idx"
  ON "Test"("chapterId", "topicId", "isActive", "isPublished");
CREATE INDEX "Test_availableFrom_availableUntil_idx"
  ON "Test"("availableFrom", "availableUntil");
CREATE INDEX "TestSection_testId_idx" ON "TestSection"("testId");
CREATE INDEX "TestQuestion_testId_displayOrder_idx"
  ON "TestQuestion"("testId", "displayOrder");
CREATE INDEX "TestQuestion_questionId_idx" ON "TestQuestion"("questionId");
CREATE INDEX "TestAttempt_studentId_status_startedAt_idx"
  ON "TestAttempt"("studentId", "status", "startedAt");
CREATE INDEX "TestAttempt_testId_status_idx"
  ON "TestAttempt"("testId", "status");
CREATE INDEX "TestAttempt_deadlineAt_idx" ON "TestAttempt"("deadlineAt");
CREATE INDEX "TestAttemptAnswer_attemptId_idx"
  ON "TestAttemptAnswer"("attemptId");
CREATE INDEX "TestAttemptAnswer_testQuestionId_idx"
  ON "TestAttemptAnswer"("testQuestionId");
CREATE INDEX "TestAttemptAnswer_selectedOptionId_idx"
  ON "TestAttemptAnswer"("selectedOptionId");

ALTER TABLE "Test"
  ADD CONSTRAINT "Test_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "Exam"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Test_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Test_academicClassId_fkey"
    FOREIGN KEY ("academicClassId") REFERENCES "AcademicClass"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Test_chapterId_fkey"
    FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Test_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Test_subtopicId_fkey"
    FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TestSection"
  ADD CONSTRAINT "TestSection_testId_fkey"
    FOREIGN KEY ("testId") REFERENCES "Test"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestQuestion"
  ADD CONSTRAINT "TestQuestion_testId_fkey"
    FOREIGN KEY ("testId") REFERENCES "Test"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TestQuestion_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "TestSection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TestQuestion_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TestAttempt"
  ADD CONSTRAINT "TestAttempt_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TestAttempt_testId_fkey"
    FOREIGN KEY ("testId") REFERENCES "Test"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TestAttemptAnswer"
  ADD CONSTRAINT "TestAttemptAnswer_attemptId_fkey"
    FOREIGN KEY ("attemptId") REFERENCES "TestAttempt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TestAttemptAnswer_testQuestionId_fkey"
    FOREIGN KEY ("testQuestionId") REFERENCES "TestQuestion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TestAttemptAnswer_selectedOptionId_fkey"
    FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
