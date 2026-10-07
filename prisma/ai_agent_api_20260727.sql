ALTER TABLE "AiAgent" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "AiAgent_workspaceId_archivedAt_updatedAt_idx"
  ON "AiAgent"("workspaceId", "archivedAt", "updatedAt");
