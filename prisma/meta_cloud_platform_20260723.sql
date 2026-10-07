ALTER TABLE "ChannelConnection" ADD COLUMN IF NOT EXISTS "accessTokenEncrypted" TEXT;

CREATE TABLE IF NOT EXISTS "WhatsAppTemplate" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "connectionId" TEXT NOT NULL REFERENCES "ChannelConnection"("id") ON DELETE CASCADE,
  "externalTemplateId" TEXT,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "components" JSONB NOT NULL,
  "rejectionReason" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppTemplate_connectionId_name_language_key" ON "WhatsAppTemplate"("connectionId","name","language");
CREATE INDEX IF NOT EXISTS "WhatsAppTemplate_workspaceId_status_updatedAt_idx" ON "WhatsAppTemplate"("workspaceId","status","updatedAt");

CREATE TABLE IF NOT EXISTS "WhatsAppConsent" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "contactAddress" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'opted_in',
  "source" TEXT NOT NULL,
  "proof" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "optedOutAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConsent_workspaceId_contactAddress_key" ON "WhatsAppConsent"("workspaceId","contactAddress");
CREATE INDEX IF NOT EXISTS "WhatsAppConsent_workspaceId_status_updatedAt_idx" ON "WhatsAppConsent"("workspaceId","status","updatedAt");

CREATE TABLE IF NOT EXISTS "WhatsAppCampaign" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "connectionId" TEXT NOT NULL REFERENCES "ChannelConnection"("id") ON DELETE RESTRICT,
  "templateId" TEXT NOT NULL REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT,
  "createdByMemberId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "audience" JSONB NOT NULL,
  "scheduledFor" TIMESTAMP(3),
  "audienceCount" INTEGER NOT NULL DEFAULT 0,
  "eligibleCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  "readCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "optOutCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WhatsAppCampaign_workspaceId_status_createdAt_idx" ON "WhatsAppCampaign"("workspaceId","status","createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppCampaign_connectionId_scheduledFor_idx" ON "WhatsAppCampaign"("connectionId","scheduledFor");

CREATE TABLE IF NOT EXISTS "WhatsAppMigration" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "createdByMemberId" TEXT NOT NULL,
  "sourceProvider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "mode" TEXT NOT NULL DEFAULT 'dry_run',
  "summary" JSONB NOT NULL,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WhatsAppMigration_workspaceId_status_createdAt_idx" ON "WhatsAppMigration"("workspaceId","status","createdAt");
