-- Permanently remove the discontinued referral, commission, rewards, and payout feature.
-- A full database backup must be created before applying this migration.

DROP TABLE IF EXISTS "ReferralCommission";
DROP TABLE IF EXISTS "PointEvent";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "referredById",
  DROP COLUMN IF EXISTS "referralCode",
  DROP COLUMN IF EXISTS "points",
  DROP COLUMN IF EXISTS "payoutWallet";
