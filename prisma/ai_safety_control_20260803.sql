ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "aiExecutionPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "aiExecutionPausedAt" TIMESTAMP(3);
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "aiExecutionPauseReason" TEXT;

CREATE TABLE IF NOT EXISTS "AiEvaluation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "agentId" TEXT NOT NULL,
  "suiteVersion" TEXT NOT NULL DEFAULT 'v1', "roleType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running', "casesTotal" INTEGER NOT NULL DEFAULT 0,
  "casesPassed" INTEGER NOT NULL DEFAULT 0, "accuracyScore" DOUBLE PRECISION,
  "refusalScore" DOUBLE PRECISION, "escalationScore" DOUBLE PRECISION,
  "hallucinationScore" DOUBLE PRECISION, "averageLatencyMs" INTEGER,
  "inputTokens" INTEGER, "outputTokens" INTEGER, "estimatedCostUsd" DOUBLE PRECISION,
  "evidence" JSONB, "failureReason" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiEvaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiEvaluation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiEvaluation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AiEvaluation_workspaceId_status_createdAt_idx" ON "AiEvaluation"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AiEvaluation_agentId_status_createdAt_idx" ON "AiEvaluation"("agentId", "status", "createdAt");
