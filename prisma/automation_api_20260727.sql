ALTER TABLE "AutomationRule" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "AutomationRule_workspaceId_archivedAt_updatedAt_idx"
  ON "AutomationRule"("workspaceId", "archivedAt", "updatedAt");
