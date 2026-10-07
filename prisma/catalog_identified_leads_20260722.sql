-- Identified catalog inquiries linked to Wazap Flow leads.
-- Additive and backward-compatible with historical anonymous order clicks.

ALTER TABLE "CatalogOrder"
  ADD COLUMN IF NOT EXISTS "leadId" TEXT,
  ADD COLUMN IF NOT EXISTS "customerName" TEXT,
  ADD COLUMN IF NOT EXISTS "customerPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "customerEmail" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CatalogOrder_leadId_fkey'
  ) THEN
    ALTER TABLE "CatalogOrder"
      ADD CONSTRAINT "CatalogOrder_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CatalogOrder_leadId_createdAt_idx"
  ON "CatalogOrder"("leadId", "createdAt");
