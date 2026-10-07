ALTER TABLE "MarketplaceInstall"
  ADD COLUMN IF NOT EXISTS "setupStatus" TEXT NOT NULL DEFAULT 'installed',
  ADD COLUMN IF NOT EXISTS "lastTestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MarketplaceInstall_workspaceId_setupStatus_idx"
  ON "MarketplaceInstall"("workspaceId", "setupStatus");

CREATE TABLE IF NOT EXISTS "MarketplaceReview" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'published',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceReview_listingId_workspaceId_key"
  ON "MarketplaceReview"("listingId", "workspaceId");
CREATE INDEX IF NOT EXISTS "MarketplaceReview_listingId_status_createdAt_idx"
  ON "MarketplaceReview"("listingId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketplaceReview_userId_createdAt_idx"
  ON "MarketplaceReview"("userId", "createdAt");
