BEGIN;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'USD';
CREATE TABLE IF NOT EXISTS "SecurityRateLimit" (
 "key" text PRIMARY KEY, "count" integer NOT NULL, "resetAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "SecurityRateLimit_expiry" ON "SecurityRateLimit" ("resetAt");
CREATE TABLE IF NOT EXISTS "SecurityPaymentCharge" (
 "provider" text NOT NULL, "chargeId" text NOT NULL,
 "paymentId" text NOT NULL UNIQUE REFERENCES "Payment"("id") ON DELETE RESTRICT,
 "currency" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY ("provider", "chargeId")
);
-- Preserve every historical payment. Backfill the earliest active record for
-- each identity; existing duplicate rows are separately audited, never deleted.
INSERT INTO "SecurityPaymentCharge" ("provider", "chargeId", "paymentId", "currency")
SELECT "method", "txId", "id", 'UNVERIFIED' FROM (
 SELECT "id", "method", "txId", row_number() OVER (PARTITION BY "method", "txId" ORDER BY "createdAt", "id") AS n
 FROM "Payment" WHERE "status" = 'active' AND "method" IN ('paypal', 'dodo') AND "txId" IS NOT NULL AND ("method" != 'paypal' OR "txId" NOT LIKE 'I-%')
) p WHERE n = 1 ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "SecurityMfa" (
 "userId" text PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "enabled" boolean NOT NULL DEFAULT false, "secret" text, "pending" text,
 "pendingExpiresAt" timestamptz, "lastStep" bigint NOT NULL DEFAULT -1,
 "recoveryHashes" text[] NOT NULL DEFAULT '{}', "enabledAt" timestamptz
);
CREATE TABLE IF NOT EXISTS "SecurityBillingEvent" (
 "provider" text NOT NULL, "eventId" text NOT NULL, "occurredAt" timestamptz NOT NULL,
 "processedAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("provider", "eventId")
);
CREATE TABLE IF NOT EXISTS "SecuritySubscriptionState" (
 "provider" text NOT NULL, "subscriptionId" text NOT NULL, "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "occurredAt" timestamptz NOT NULL, PRIMARY KEY ("provider", "subscriptionId")
);
CREATE TABLE IF NOT EXISTS "SecurityUserBilling" (
 "userId" text PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "provider" text NOT NULL, "subscriptionId" text NOT NULL, "occurredAt" timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS "SecurityPaymentReconciliation" (
 "paymentId" text PRIMARY KEY, "canonicalPaymentId" text, "original" jsonb NOT NULL,
 "reason" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
);
COMMIT;
