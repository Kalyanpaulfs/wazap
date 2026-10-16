-- Salesperson names for rotator numbers. Additive only: a JSONB column with
-- a safe default, no behaviour change for existing rows until the UI/API
-- start writing to it (app/api/rotator/route.ts, app/tools/rotator/page.tsx).
--
-- numberNames: map of digits-only number (as stored in RotatorLink.numbers)
--   to an optional display name, e.g. {"919800000001": "Ravi"}. Numbers with
--   no entry fall back to showing the raw number, as today.

ALTER TABLE "RotatorLink" ADD COLUMN IF NOT EXISTS "numberNames" JSONB NOT NULL DEFAULT '{}'::jsonb;
