ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "removalReason" TEXT;
ALTER TABLE "MarketplaceVersion" ADD COLUMN IF NOT EXISTS "manifestHash" TEXT;
ALTER TABLE "MarketplaceVersion" ADD COLUMN IF NOT EXISTS "securityReviewStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "MarketplaceVersion" ADD COLUMN IF NOT EXISTS "securityEvidence" JSONB;
ALTER TABLE "MarketplaceVersion" ADD COLUMN IF NOT EXISTS "riskLevel" TEXT;
ALTER TABLE "MarketplaceVersion" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceVersion" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceVersion" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceInstall" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceInstall" ADD COLUMN IF NOT EXISTS "statusReason" TEXT;
ALTER TABLE "MarketplaceModeration" ADD COLUMN IF NOT EXISTS "versionId" TEXT;
ALTER TABLE "MarketplaceModeration" ADD COLUMN IF NOT EXISTS "riskLevel" TEXT;
ALTER TABLE "MarketplaceModeration" ADD COLUMN IF NOT EXISTS "securityEvidence" JSONB;

UPDATE "MarketplaceVersion"
SET "securityReviewStatus" = 'legacy_review_required',
    "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "status" = 'published' AND "securityReviewStatus" = 'pending';

DO $$ BEGIN
  ALTER TABLE "MarketplaceModeration" ADD CONSTRAINT "MarketplaceModeration_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "MarketplaceAbuseReport" (
  "id" TEXT NOT NULL, "listingId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
  "reporterUserId" TEXT NOT NULL, "category" TEXT NOT NULL, "details" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open', "resolution" TEXT, "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceAbuseReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceAbuseReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MarketplaceAbuseReport_listingId_status_createdAt_idx" ON "MarketplaceAbuseReport"("listingId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketplaceAbuseReport_workspaceId_createdAt_idx" ON "MarketplaceAbuseReport"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketplaceAbuseReport_reporterUserId_createdAt_idx" ON "MarketplaceAbuseReport"("reporterUserId", "createdAt");
