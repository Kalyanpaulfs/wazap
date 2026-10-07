ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "idempotencyKeyHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "InboxMessage_idempotencyKeyHash_key"
  ON "InboxMessage"("idempotencyKeyHash");
