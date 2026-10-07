ALTER TABLE "PartnerAccount"
  ADD COLUMN IF NOT EXISTS "termsVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termsAcceptedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "attributionWindowDays" INTEGER NOT NULL DEFAULT 30;

UPDATE "PartnerAccount"
SET "status" = 'pending_terms'
WHERE "status" = 'active' AND ("termsVersion" IS NULL OR "termsAcceptedAt" IS NULL);

ALTER TABLE "PartnerAccount" ALTER COLUMN "status" SET DEFAULT 'pending_terms';

CREATE TABLE IF NOT EXISTS "PartnerReferralTouch" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "source" TEXT,
  "landingPage" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedWorkspaceId" TEXT,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerReferralTouch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerReferralTouch_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartnerReferralTouch_claimedWorkspaceId_fkey" FOREIGN KEY ("claimedWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerReferralTouch_tokenHash_key" ON "PartnerReferralTouch"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerReferralTouch_claimedWorkspaceId_key" ON "PartnerReferralTouch"("claimedWorkspaceId");
CREATE INDEX IF NOT EXISTS "PartnerReferralTouch_partnerId_createdAt_idx" ON "PartnerReferralTouch"("partnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerReferralTouch_expiresAt_claimedAt_idx" ON "PartnerReferralTouch"("expiresAt", "claimedAt");
