-- Billing spec 12f/12g, step 1. Additive only: nullable columns with no
-- default behaviour change. Safe to run on production. Old rows are
-- unaffected until syncPlanLimits() (lib/plan-limit-sync.ts) starts writing
-- to these columns, which itself is gated behind PLAN_LIMIT_PAUSING_ENABLED.
--
-- planPausedAt: set when an item is paused because it no longer fits the
--   user's current plan limit; cleared when it is resumed. NULL = not
--   plan-paused (it may still be paused by the user themselves via the
--   model's own `status` field, which this migration does not touch).
-- planPausedFromStatus: for models that already have a `status` column,
--   the exact previous status value, saved so the item can be restored
--   exactly when it is resumed. Only added where `status` exists.

ALTER TABLE "RotatorLink" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "ShortLink" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "AdLink" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "LinktreePage" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "CatalogPage" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);

ALTER TABLE "AutomationRule" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "AutomationRule" ADD COLUMN IF NOT EXISTS "planPausedFromStatus" TEXT;

ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "planPausedFromStatus" TEXT;

ALTER TABLE "AiKnowledge" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "AiKnowledge" ADD COLUMN IF NOT EXISTS "planPausedFromStatus" TEXT;

ALTER TABLE "ChannelConnection" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "ChannelConnection" ADD COLUMN IF NOT EXISTS "planPausedFromStatus" TEXT;

ALTER TABLE "MarketplaceInstall" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceInstall" ADD COLUMN IF NOT EXISTS "planPausedFromStatus" TEXT;

ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "planPausedFromStatus" TEXT;

ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "planPausedAt" TIMESTAMP(3);
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "planPausedFromStatus" TEXT;
