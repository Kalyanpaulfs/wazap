CREATE TABLE IF NOT EXISTS "AiAgent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "roleType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "responseMode" TEXT NOT NULL DEFAULT 'draft_only', "instructions" TEXT NOT NULL,
  "tone" TEXT NOT NULL DEFAULT 'professional', "language" TEXT NOT NULL DEFAULT 'auto',
  "allowedTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "prohibitedTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "escalationKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "requireHumanFor" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "maxMessagesPerThread" INTEGER NOT NULL DEFAULT 5, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiAgent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AiKnowledge" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL, "content" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'text', "sourceUrl" TEXT, "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiKnowledge_pkey" PRIMARY KEY ("id"), CONSTRAINT "AiKnowledge_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AiRun" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "agentId" TEXT NOT NULL, "conversationId" TEXT,
  "trigger" TEXT NOT NULL DEFAULT 'manual', "status" TEXT NOT NULL DEFAULT 'queued', "model" TEXT,
  "promptVersion" TEXT NOT NULL DEFAULT 'v1', "inputTokens" INTEGER, "outputTokens" INTEGER, "estimatedCostUsd" DOUBLE PRECISION,
  "errorCode" TEXT, "errorMessage" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AiDraft" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "agentId" TEXT NOT NULL, "runId" TEXT NOT NULL, "conversationId" TEXT NOT NULL,
  "content" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "reviewedByMemberId" TEXT, "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id"), CONSTRAINT "AiDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiDraft_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiDraft_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiDraft_reviewedByMemberId_fkey" FOREIGN KEY ("reviewedByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AiHandoff" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "agentId" TEXT, "reason" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'normal', "status" TEXT NOT NULL DEFAULT 'open', "assignedMemberId" TEXT, "resolvedByMemberId" TEXT,
  "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiHandoff_pkey" PRIMARY KEY ("id"), CONSTRAINT "AiHandoff_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiHandoff_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiHandoff_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiHandoff_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiHandoff_resolvedByMemberId_fkey" FOREIGN KEY ("resolvedByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiAgent_workspaceId_name_key" ON "AiAgent"("workspaceId", "name");
CREATE INDEX IF NOT EXISTS "AiAgent_workspaceId_status_idx" ON "AiAgent"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "AiAgent_workspaceId_roleType_idx" ON "AiAgent"("workspaceId", "roleType");
CREATE INDEX IF NOT EXISTS "AiKnowledge_workspaceId_status_idx" ON "AiKnowledge"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "AiRun_workspaceId_status_createdAt_idx" ON "AiRun"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AiRun_agentId_createdAt_idx" ON "AiRun"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiRun_conversationId_createdAt_idx" ON "AiRun"("conversationId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AiDraft_runId_key" ON "AiDraft"("runId");
CREATE INDEX IF NOT EXISTS "AiDraft_workspaceId_status_createdAt_idx" ON "AiDraft"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AiDraft_conversationId_status_idx" ON "AiDraft"("conversationId", "status");
CREATE INDEX IF NOT EXISTS "AiHandoff_workspaceId_status_createdAt_idx" ON "AiHandoff"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AiHandoff_conversationId_status_idx" ON "AiHandoff"("conversationId", "status");
CREATE INDEX IF NOT EXISTS "AiHandoff_assignedMemberId_status_idx" ON "AiHandoff"("assignedMemberId", "status");
