-- Phase 10A: mentor profile and subject-expertise foundation only.

CREATE TABLE "MentorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "headline" TEXT,
  "bio" TEXT,
  "profileImageUrl" TEXT,
  "experienceYears" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MentorProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MentorProfile_experienceYears_check" CHECK ("experienceYears" >= 0)
);

CREATE TABLE "MentorSubjectExpertise" (
  "mentorProfileId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MentorSubjectExpertise_pkey" PRIMARY KEY ("mentorProfileId", "subjectId")
);

CREATE UNIQUE INDEX "MentorProfile_userId_key" ON "MentorProfile"("userId");
CREATE INDEX "MentorProfile_isActive_idx" ON "MentorProfile"("isActive");
CREATE INDEX "MentorSubjectExpertise_subjectId_idx" ON "MentorSubjectExpertise"("subjectId");

ALTER TABLE "MentorProfile"
  ADD CONSTRAINT "MentorProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MentorSubjectExpertise"
  ADD CONSTRAINT "MentorSubjectExpertise_mentorProfileId_fkey"
    FOREIGN KEY ("mentorProfileId") REFERENCES "MentorProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MentorSubjectExpertise_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
