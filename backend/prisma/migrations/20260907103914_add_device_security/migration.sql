-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN     "deviceId" TEXT;

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "approvalChallengeHash" TEXT,
    "approvalExpiresAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDevice_userId_isApproved_revokedAt_idx" ON "UserDevice"("userId", "isApproved", "revokedAt");

-- CreateIndex
CREATE INDEX "UserDevice_userId_isPrimary_idx" ON "UserDevice"("userId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_installationId_key" ON "UserDevice"("userId", "installationId");

-- CreateIndex
CREATE INDEX "RefreshSession_deviceId_idx" ON "RefreshSession"("deviceId");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "UserDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
