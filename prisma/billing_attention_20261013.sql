-- Payment fixes PAY-2/PAY-6. Additive only: safe to run on production.
CREATE TABLE IF NOT EXISTS "BillingAttention" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "chargeId" TEXT,
  "userId" TEXT,
  "email" TEXT,
  "amount" DOUBLE PRECISION,
  "currency" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "BillingAttention_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BillingAttention_provider_eventId_key" ON "BillingAttention"("provider", "eventId");
CREATE INDEX IF NOT EXISTS "BillingAttention_resolvedAt_createdAt_idx" ON "BillingAttention"("resolvedAt", "createdAt");
