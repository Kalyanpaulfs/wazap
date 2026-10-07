CREATE TABLE IF NOT EXISTS "InboxConversation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "leadId" TEXT, "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "externalThreadId" TEXT, "contactName" TEXT NOT NULL, "contactAddress" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'normal', "assignedMemberId" TEXT, "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastMessagePreview" TEXT, "firstResponseAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3), "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InboxConversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboxConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InboxConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InboxConversation_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "InboxMessage" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "direction" TEXT NOT NULL, "senderType" TEXT NOT NULL,
  "senderMemberId" TEXT, "providerMessageId" TEXT, "text" TEXT NOT NULL, "deliveryStatus" TEXT NOT NULL DEFAULT 'recorded',
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InboxMessage_senderMemberId_fkey" FOREIGN KEY ("senderMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "InboxNote" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "authorMemberId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InboxNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboxNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InboxNote_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "InboxTask" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "conversationId" TEXT, "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'normal', "dueAt" TIMESTAMP(3), "assignedMemberId" TEXT, "createdByMemberId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboxTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboxTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InboxTask_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InboxTask_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InboxTask_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "InboxEvent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "actorMemberId" TEXT, "type" TEXT NOT NULL,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboxEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InboxEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InboxEvent_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "InboxConversation_workspaceId_channel_contactAddress_key" ON "InboxConversation"("workspaceId", "channel", "contactAddress");
CREATE INDEX IF NOT EXISTS "InboxConversation_workspaceId_status_lastMessageAt_idx" ON "InboxConversation"("workspaceId", "status", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "InboxConversation_workspaceId_assignedMemberId_status_idx" ON "InboxConversation"("workspaceId", "assignedMemberId", "status");
CREATE INDEX IF NOT EXISTS "InboxConversation_leadId_idx" ON "InboxConversation"("leadId");
CREATE UNIQUE INDEX IF NOT EXISTS "InboxMessage_providerMessageId_key" ON "InboxMessage"("providerMessageId");
CREATE INDEX IF NOT EXISTS "InboxMessage_conversationId_sentAt_idx" ON "InboxMessage"("conversationId", "sentAt");
CREATE INDEX IF NOT EXISTS "InboxMessage_deliveryStatus_createdAt_idx" ON "InboxMessage"("deliveryStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "InboxNote_conversationId_createdAt_idx" ON "InboxNote"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "InboxTask_workspaceId_status_dueAt_idx" ON "InboxTask"("workspaceId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "InboxTask_conversationId_status_idx" ON "InboxTask"("conversationId", "status");
CREATE INDEX IF NOT EXISTS "InboxTask_assignedMemberId_status_idx" ON "InboxTask"("assignedMemberId", "status");
CREATE INDEX IF NOT EXISTS "InboxEvent_conversationId_createdAt_idx" ON "InboxEvent"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "InboxEvent_workspaceId_type_createdAt_idx" ON "InboxEvent"("workspaceId", "type", "createdAt");

-- Repair email observability schema drift already referenced by the live worker.
ALTER TABLE "OutboundEmail" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundEmail_providerMessageId_key" ON "OutboundEmail"("providerMessageId");
