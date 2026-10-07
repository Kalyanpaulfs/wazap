-- Wazap Flow foundation: outcome tracking, lead history, and recoverable archive.
-- Additive migration only; existing leads and billing records are preserved.

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lostReason" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "body" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ConversationStart" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "leadId" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "assetType" TEXT NOT NULL,
  "assetId" TEXT,
  "assetName" TEXT,
  "source" TEXT,
  "campaign" TEXT,
  "destination" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationStart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationStart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConversationStart_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Lead_userId_archivedAt_idx" ON "Lead"("userId", "archivedAt");
CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadActivity_type_createdAt_idx" ON "LeadActivity"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversationStart_userId_createdAt_idx" ON "ConversationStart"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversationStart_userId_source_createdAt_idx" ON "ConversationStart"("userId", "source", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversationStart_assetType_assetId_createdAt_idx" ON "ConversationStart"("assetType", "assetId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversationStart_leadId_createdAt_idx" ON "ConversationStart"("leadId", "createdAt");
