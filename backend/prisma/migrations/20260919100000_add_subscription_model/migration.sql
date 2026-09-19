-- Phase 13B: Synapse-owned, provider-neutral subscription lifecycle.

CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "startsAt" TIMESTAMP(3),
  "currentPeriodStartAt" TIMESTAMP(3),
  "currentPeriodEndAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "cancelledAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "planCodeSnapshot" TEXT NOT NULL,
  "planNameSnapshot" TEXT NOT NULL,
  "currencySnapshot" TEXT NOT NULL,
  "priceMinorSnapshot" INTEGER NOT NULL,
  "billingIntervalSnapshot" "BillingInterval" NOT NULL,
  "billingIntervalCountSnapshot" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Subscription_userId_status_createdAt_idx" ON "Subscription"("userId", "status", "createdAt");
CREATE INDEX "Subscription_planId_createdAt_idx" ON "Subscription"("planId", "createdAt");
CREATE INDEX "Subscription_status_createdAt_idx" ON "Subscription"("status", "createdAt");

-- A user has at most one in-flight or current access relationship. Ended
-- subscriptions remain historical records and are not constrained by this index.
CREATE UNIQUE INDEX "Subscription_current_user_key" ON "Subscription"("userId")
  WHERE "status" IN ('PENDING', 'ACTIVE', 'PAST_DUE');

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
