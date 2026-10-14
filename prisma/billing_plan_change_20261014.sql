-- Billing spec 12f. Additive only: safe to run on production. Old
-- subscriptions/renewals follow the old path unchanged.
CREATE TABLE IF NOT EXISTS "BillingPlanChange" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fromPlan" TEXT NOT NULL,
  "toPlan" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "oldSubscriptionId" TEXT,
  "newSubscriptionId" TEXT,
  "effectiveAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingPlanChange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BillingPlanChange_userId_pending_key" ON "BillingPlanChange"("userId") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "BillingPlanChange_userId_createdAt_idx" ON "BillingPlanChange"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "BillingPlanChange_status_effectiveAt_idx" ON "BillingPlanChange"("status", "effectiveAt");

CREATE TABLE IF NOT EXISTS "BillingRefund" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerRefundId" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'admin',
  "requestedBy" TEXT,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingRefund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BillingRefund_paymentId_key" ON "BillingRefund"("paymentId");
CREATE INDEX IF NOT EXISTS "BillingRefund_status_createdAt_idx" ON "BillingRefund"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "BillingAuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BillingAuditLog_userId_createdAt_idx" ON "BillingAuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "BillingAuditLog_action_createdAt_idx" ON "BillingAuditLog"("action", "createdAt");

ALTER TABLE "SecurityUserBilling" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT true;
