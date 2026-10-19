-- Owner feature request ("the pause button is not there"): a per-link pause
-- the CUSTOMER controls themselves, distinct from `planPausedAt` (set/
-- cleared automatically by lib/plan-limit-sync.ts when a link no longer
-- fits the plan). Additive only: a nullable column with no default
-- behaviour change. Safe to run on production.
--
-- pausedAt: set when the customer pauses their own link from My links;
--   cleared when they resume it. NULL = not manually paused. A manually-
--   paused link still counts toward the shared link pool (lib/link-pool.ts
--   countLiveLinks only checks planPausedAt), so pausing can't be used to
--   dodge the plan limit. lib/plan-limit-sync.ts never reads or writes this
--   column - it only ever touches planPausedAt.

ALTER TABLE "RotatorLink" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "ShortLink" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "AdLink" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
