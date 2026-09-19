-- Phase 13A: provider-agnostic subscription plan and feature catalog.

CREATE TYPE "BillingInterval" AS ENUM ('ONE_TIME', 'DAY', 'WEEK', 'MONTH', 'YEAR');

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "currency" TEXT NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "billingInterval" "BillingInterval" NOT NULL,
  "billingIntervalCount" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanFeature" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "limit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE INDEX "SubscriptionPlan_active_published_sortOrder_code_idx"
  ON "SubscriptionPlan"("active", "published", "sortOrder", "code");
CREATE UNIQUE INDEX "PlanFeature_planId_key_key" ON "PlanFeature"("planId", "key");

ALTER TABLE "PlanFeature"
  ADD CONSTRAINT "PlanFeature_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
