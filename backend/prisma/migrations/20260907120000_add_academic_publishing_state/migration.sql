-- Add independent publishing state to each academic hierarchy level.
-- A true default preserves visibility of all existing academic records.
ALTER TABLE "Exam" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Subject" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AcademicClass" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Chapter" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Topic" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Subtopic" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
