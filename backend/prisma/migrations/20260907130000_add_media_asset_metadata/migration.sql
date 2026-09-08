-- Provider-neutral metadata only. Media bytes remain with their provider.
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "url" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Video" ADD COLUMN "mediaAssetId" TEXT;
ALTER TABLE "Flashcard" ADD COLUMN "mediaAssetId" TEXT;

CREATE UNIQUE INDEX "MediaAsset_provider_externalKey_key" ON "MediaAsset"("provider", "externalKey");
CREATE INDEX "MediaAsset_provider_isActive_idx" ON "MediaAsset"("provider", "isActive");
CREATE INDEX "MediaAsset_mimeType_isActive_idx" ON "MediaAsset"("mimeType", "isActive");
CREATE INDEX "Video_mediaAssetId_idx" ON "Video"("mediaAssetId");
CREATE INDEX "Flashcard_mediaAssetId_idx" ON "Flashcard"("mediaAssetId");

ALTER TABLE "Video" ADD CONSTRAINT "Video_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
