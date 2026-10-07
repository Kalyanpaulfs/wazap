CREATE TABLE IF NOT EXISTS "WorkspaceAuditEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorUserId" TEXT,
  "targetUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkspaceAuditEvent_workspaceId_createdAt_idx"
  ON "WorkspaceAuditEvent"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkspaceAuditEvent_eventType_createdAt_idx"
  ON "WorkspaceAuditEvent"("eventType", "createdAt");

ALTER TABLE "WorkspaceAuditEvent"
  DROP CONSTRAINT IF EXISTS "WorkspaceAuditEvent_workspaceId_fkey";
ALTER TABLE "WorkspaceAuditEvent"
  ADD CONSTRAINT "WorkspaceAuditEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiKey" ALTER COLUMN "createdByMemberId" DROP NOT NULL;
ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "ApiKey_createdByMemberId_fkey";
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdByMemberId_fkey"
  FOREIGN KEY ("createdByMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationRule" ALTER COLUMN "createdByMemberId" DROP NOT NULL;
ALTER TABLE "AutomationRule" DROP CONSTRAINT IF EXISTS "AutomationRule_createdByMemberId_fkey";
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_createdByMemberId_fkey"
  FOREIGN KEY ("createdByMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChannelConnection" ALTER COLUMN "createdByMemberId" DROP NOT NULL;
ALTER TABLE "ChannelConnection" DROP CONSTRAINT IF EXISTS "ChannelConnection_createdByMemberId_fkey";
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_createdByMemberId_fkey"
  FOREIGN KEY ("createdByMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboxNote" ALTER COLUMN "authorMemberId" DROP NOT NULL;
ALTER TABLE "InboxNote" DROP CONSTRAINT IF EXISTS "InboxNote_authorMemberId_fkey";
ALTER TABLE "InboxNote" ADD CONSTRAINT "InboxNote_authorMemberId_fkey"
  FOREIGN KEY ("authorMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboxTask" ALTER COLUMN "createdByMemberId" DROP NOT NULL;
ALTER TABLE "InboxTask" DROP CONSTRAINT IF EXISTS "InboxTask_createdByMemberId_fkey";
ALTER TABLE "InboxTask" ADD CONSTRAINT "InboxTask_createdByMemberId_fkey"
  FOREIGN KEY ("createdByMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketplaceInstall" ALTER COLUMN "installedByMemberId" DROP NOT NULL;
ALTER TABLE "MarketplaceInstall" DROP CONSTRAINT IF EXISTS "MarketplaceInstall_installedByMemberId_fkey";
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_installedByMemberId_fkey"
  FOREIGN KEY ("installedByMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WebhookEndpoint" ALTER COLUMN "createdByMemberId" DROP NOT NULL;
ALTER TABLE "WebhookEndpoint" DROP CONSTRAINT IF EXISTS "WebhookEndpoint_createdByMemberId_fkey";
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdByMemberId_fkey"
  FOREIGN KEY ("createdByMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
