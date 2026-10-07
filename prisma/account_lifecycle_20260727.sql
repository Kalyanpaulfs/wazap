ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "accountDeletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accountDeletionScheduledFor" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_accountDeletionScheduledFor_idx"
  ON "User"("accountDeletionScheduledFor");
