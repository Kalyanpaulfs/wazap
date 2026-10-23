-- Per-salesperson pause for the Lead rotator. Additive only: a TEXT[] column
-- with a safe default, no behaviour change for existing rows until the
-- UI/API start writing to it (app/api/rotator/route.ts,
-- app/links/[type]/[id]/LinkDetailsClient.tsx).
--
-- pausedNumbers: digits-only numbers from RotatorLink.numbers that the
--   owner paused individually. The click router skips these when rotating
--   but leaves them in `numbers`/`numberNames` so past performance still
--   shows them. See lib/rotator-routing.ts.

ALTER TABLE "RotatorLink" ADD COLUMN IF NOT EXISTS "pausedNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
