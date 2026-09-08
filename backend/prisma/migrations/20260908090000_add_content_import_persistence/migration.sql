-- Phase 5F: persisted preview/apply metadata and CMS audit events only.
CREATE TYPE "ContentImportTarget" AS ENUM ('ACADEMIC_EXAM', 'ACADEMIC_SUBJECT', 'ACADEMIC_CLASS', 'ACADEMIC_CHAPTER', 'ACADEMIC_TOPIC', 'ACADEMIC_SUBTOPIC', 'VIDEO', 'REVISION_ITEM', 'FLASHCARD');
CREATE TYPE "ContentImportStatus" AS ENUM ('PREVIEWED', 'APPLYING', 'APPLIED', 'FAILED');
CREATE TYPE "ContentImportDuplicateStrategy" AS ENUM ('ERROR', 'SKIP', 'UPDATE');
CREATE TYPE "ContentImportRowStatus" AS ENUM ('VALID', 'INVALID', 'APPLIED', 'SKIPPED', 'FAILED');

CREATE TABLE "ContentImportJob" (
  "id" TEXT NOT NULL, "target" "ContentImportTarget" NOT NULL,
  "status" "ContentImportStatus" NOT NULL DEFAULT 'PREVIEWED',
  "originalFilename" TEXT NOT NULL, "checksum" TEXT NOT NULL,
  "duplicateStrategy" "ContentImportDuplicateStrategy" NOT NULL DEFAULT 'ERROR',
  "createdByUserId" TEXT NOT NULL, "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0, "invalidRows" INTEGER NOT NULL DEFAULT 0,
  "insertedRows" INTEGER NOT NULL DEFAULT 0, "updatedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0, "failedRows" INTEGER NOT NULL DEFAULT 0,
  "previewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentImportJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContentImportRow" (
  "id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "rowNumber" INTEGER NOT NULL,
  "normalizedData" JSONB NOT NULL, "status" "ContentImportRowStatus" NOT NULL DEFAULT 'VALID',
  "errorCode" TEXT, "errorMessage" TEXT, "resultingEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentImportRow_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContentAuditEvent" (
  "id" TEXT NOT NULL, "actorUserId" TEXT NOT NULL, "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL, "action" TEXT NOT NULL, "beforeData" JSONB,
  "afterData" JSONB, "importJobId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentImportRow_jobId_rowNumber_key" ON "ContentImportRow"("jobId", "rowNumber");
CREATE INDEX "ContentImportJob_createdByUserId_createdAt_idx" ON "ContentImportJob"("createdByUserId", "createdAt");
CREATE INDEX "ContentImportJob_status_createdAt_idx" ON "ContentImportJob"("status", "createdAt");
CREATE INDEX "ContentImportJob_target_createdAt_idx" ON "ContentImportJob"("target", "createdAt");
CREATE INDEX "ContentImportRow_jobId_status_idx" ON "ContentImportRow"("jobId", "status");
CREATE INDEX "ContentAuditEvent_entityType_entityId_createdAt_idx" ON "ContentAuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "ContentAuditEvent_actorUserId_createdAt_idx" ON "ContentAuditEvent"("actorUserId", "createdAt");
CREATE INDEX "ContentAuditEvent_importJobId_idx" ON "ContentAuditEvent"("importJobId");
ALTER TABLE "ContentImportJob" ADD CONSTRAINT "ContentImportJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentImportRow" ADD CONSTRAINT "ContentImportRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ContentImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentAuditEvent" ADD CONSTRAINT "ContentAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentAuditEvent" ADD CONSTRAINT "ContentAuditEvent_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ContentImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
