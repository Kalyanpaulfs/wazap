ALTER TABLE "InboxTask" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "InboxTask_workspaceId_archivedAt_updatedAt_idx"
  ON "InboxTask"("workspaceId", "archivedAt", "updatedAt");
