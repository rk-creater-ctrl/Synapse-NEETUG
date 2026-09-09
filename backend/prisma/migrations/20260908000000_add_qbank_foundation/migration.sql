-- Phase 6A: QBank, PYQ metadata, and lightweight practice persistence.
-- Existing Phase 1-5 tables and rows are intentionally not rewritten.

CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CORRECT_MCQ');
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "QuestionSourceType" AS ENUM ('CURATED', 'PYQ');
CREATE TYPE "QuestionPracticeSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'SINGLE_CORRECT_MCQ',
    "sourceType" "QuestionSourceType" NOT NULL DEFAULT 'CURATED',
    "stem" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[] NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFree" BOOLEAN NOT NULL DEFAULT true,
    "importKey" TEXT,
    "examId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicClassId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "subtopicId" TEXT,
    "mediaAssetId" TEXT,
    "solutionVideoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionPyqMetadata" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sourceExam" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "paperKey" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "sourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPyqMetadata_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionPracticeSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "selectedFilters" JSONB NOT NULL,
    "status" "QuestionPracticeSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPracticeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionPracticeItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "selectedOptionId" TEXT,
    "isCorrect" BOOLEAN,
    "timeSpentSeconds" INTEGER,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPracticeItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Question_importKey_key" ON "Question"("importKey");
CREATE INDEX "Question_topicId_isActive_isPublished_isFree_displayOrder_idx" ON "Question"("topicId", "isActive", "isPublished", "isFree", "displayOrder");
CREATE INDEX "Question_chapterId_isActive_isPublished_displayOrder_idx" ON "Question"("chapterId", "isActive", "isPublished", "displayOrder");
CREATE INDEX "Question_sourceType_difficulty_idx" ON "Question"("sourceType", "difficulty");
CREATE INDEX "Question_mediaAssetId_idx" ON "Question"("mediaAssetId");
CREATE INDEX "Question_solutionVideoId_idx" ON "Question"("solutionVideoId");

CREATE UNIQUE INDEX "QuestionOption_questionId_position_key" ON "QuestionOption"("questionId", "position");

CREATE UNIQUE INDEX "QuestionPyqMetadata_questionId_key" ON "QuestionPyqMetadata"("questionId");
CREATE UNIQUE INDEX "QuestionPyqMetadata_sourceExam_year_sessionKey_paperKey_questionNumber_key" ON "QuestionPyqMetadata"("sourceExam", "year", "sessionKey", "paperKey", "questionNumber");
CREATE INDEX "QuestionPyqMetadata_year_sourceExam_idx" ON "QuestionPyqMetadata"("year", "sourceExam");

CREATE INDEX "QuestionPracticeSession_studentId_status_startedAt_idx" ON "QuestionPracticeSession"("studentId", "status", "startedAt");

CREATE UNIQUE INDEX "QuestionPracticeItem_sessionId_sequence_key" ON "QuestionPracticeItem"("sessionId", "sequence");
CREATE UNIQUE INDEX "QuestionPracticeItem_sessionId_questionId_key" ON "QuestionPracticeItem"("sessionId", "questionId");
CREATE INDEX "QuestionPracticeItem_questionId_idx" ON "QuestionPracticeItem"("questionId");

ALTER TABLE "Question" ADD CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_academicClassId_fkey" FOREIGN KEY ("academicClassId") REFERENCES "AcademicClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_solutionVideoId_fkey" FOREIGN KEY ("solutionVideoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionPyqMetadata" ADD CONSTRAINT "QuestionPyqMetadata_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionPracticeSession" ADD CONSTRAINT "QuestionPracticeSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionPracticeItem" ADD CONSTRAINT "QuestionPracticeItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QuestionPracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionPracticeItem" ADD CONSTRAINT "QuestionPracticeItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionPracticeItem" ADD CONSTRAINT "QuestionPracticeItem_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
