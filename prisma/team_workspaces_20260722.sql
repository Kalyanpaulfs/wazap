-- Wazap team-workspace foundation and backfill for every existing account.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeWorkspaceId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "ConversationStart" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

CREATE TABLE IF NOT EXISTS "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WorkspaceInvitation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedById" TEXT NOT NULL,
  "acceptedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_slug_key" ON "Workspace"("slug");
CREATE INDEX IF NOT EXISTS "Workspace_ownerId_idx" ON "Workspace"("ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_createdAt_idx" ON "WorkspaceMember"("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_status_idx" ON "WorkspaceInvitation"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_email_status_idx" ON "WorkspaceInvitation"("email", "status");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_expiresAt_status_idx" ON "WorkspaceInvitation"("expiresAt", "status");

INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "updatedAt")
SELECT
  'ws_' || md5(random()::text || clock_timestamp()::text || u."id"),
  COALESCE(NULLIF(TRIM(u."name"), ''), split_part(u."email", '@', 1)) || '''s workspace',
  'workspace-' || substr(md5(u."id"), 1, 12),
  u."id",
  CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "Workspace" w WHERE w."ownerId" = u."id");

INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role")
SELECT
  'wm_' || md5(random()::text || clock_timestamp()::text || w."id"),
  w."id",
  w."ownerId",
  'owner'
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkspaceMember" m WHERE m."workspaceId" = w."id" AND m."userId" = w."ownerId"
);

UPDATE "User" u SET "activeWorkspaceId" = w."id"
FROM "Workspace" w
WHERE w."ownerId" = u."id" AND u."activeWorkspaceId" IS NULL;

UPDATE "Lead" l SET "workspaceId" = u."activeWorkspaceId"
FROM "User" u
WHERE l."userId" = u."id" AND l."workspaceId" IS NULL;

UPDATE "ConversationStart" c SET "workspaceId" = u."activeWorkspaceId"
FROM "User" u
WHERE c."userId" = u."id" AND c."workspaceId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_workspaceId_fkey') THEN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConversationStart_workspaceId_fkey') THEN
    ALTER TABLE "ConversationStart" ADD CONSTRAINT "ConversationStart_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Lead_workspaceId_status_idx" ON "Lead"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Lead_workspaceId_nextFollowUpAt_idx" ON "Lead"("workspaceId", "nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "ConversationStart_workspaceId_createdAt_idx" ON "ConversationStart"("workspaceId", "createdAt");
