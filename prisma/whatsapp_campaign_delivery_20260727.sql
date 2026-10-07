CREATE TABLE IF NOT EXISTS "WhatsAppCampaignRecipient" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "campaignId" TEXT NOT NULL REFERENCES "WhatsAppCampaign"("id") ON DELETE CASCADE,
  "contactAddress" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "exclusionReason" TEXT,
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "attemptedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppCampaignRecipient_campaignId_contactAddress_key"
  ON "WhatsAppCampaignRecipient"("campaignId", "contactAddress");
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppCampaignRecipient_providerMessageId_key"
  ON "WhatsAppCampaignRecipient"("providerMessageId");
CREATE INDEX IF NOT EXISTS "WhatsAppCampaignRecipient_campaignId_status_createdAt_idx"
  ON "WhatsAppCampaignRecipient"("campaignId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppCampaignRecipient_workspaceId_status_updatedAt_idx"
  ON "WhatsAppCampaignRecipient"("workspaceId", "status", "updatedAt");
