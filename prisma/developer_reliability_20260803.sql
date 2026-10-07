ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "idempotencyRequestHash" TEXT;
CREATE TABLE IF NOT EXISTS "WebhookDeliveryAttempt" (
  "id" TEXT NOT NULL, "deliveryId" TEXT NOT NULL, "attemptNumber" INTEGER NOT NULL,
  "outcome" TEXT NOT NULL, "responseStatus" INTEGER, "latencyMs" INTEGER NOT NULL,
  "errorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookDeliveryAttempt_deliveryId_attemptNumber_key" ON "WebhookDeliveryAttempt"("deliveryId", "attemptNumber");
CREATE INDEX IF NOT EXISTS "WebhookDeliveryAttempt_outcome_createdAt_idx" ON "WebhookDeliveryAttempt"("outcome", "createdAt");
CREATE INDEX IF NOT EXISTS "WebhookDeliveryAttempt_deliveryId_createdAt_idx" ON "WebhookDeliveryAttempt"("deliveryId", "createdAt");
