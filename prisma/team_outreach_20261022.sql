-- FEAT-QUEUE: Team outreach (salesperson customer queue), phase 1 backend.
-- Additive only, safe to run on production (none of this is live yet - no
-- UI reads/writes these tables outside lib/outreach/*.ts). Idempotent:
-- IF NOT EXISTS everywhere, so it is safe to run more than once.
-- See prisma/schema.prisma (OutreachTeam/OutreachMember/OutreachDevice/
-- OutreachList/OutreachContact) and kalyan.md section 7c.

CREATE TABLE IF NOT EXISTS "OutreachTeam" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "code"              TEXT NOT NULL,
  "speedLimitSeconds" INTEGER NOT NULL DEFAULT 20,
  "dailyCap"          INTEGER,
  "defaultCountry"    TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachTeam_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OutreachTeam_userId_key" ON "OutreachTeam"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "OutreachTeam_code_key" ON "OutreachTeam"("code");
CREATE INDEX IF NOT EXISTS "OutreachTeam_userId_idx" ON "OutreachTeam"("userId");

DO $$ BEGIN
  ALTER TABLE "OutreachTeam"
    ADD CONSTRAINT "OutreachTeam_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OutreachMember" (
  "id"          TEXT NOT NULL,
  "teamId"      TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "removedAt"   TIMESTAMP(3),
  "lastGivenAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OutreachMember_teamId_phone_key" ON "OutreachMember"("teamId", "phone");
CREATE INDEX IF NOT EXISTS "OutreachMember_teamId_active_idx" ON "OutreachMember"("teamId", "active");

DO $$ BEGIN
  ALTER TABLE "OutreachMember"
    ADD CONSTRAINT "OutreachMember_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "OutreachTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OutreachDevice" (
  "id"         TEXT NOT NULL,
  "memberId"   TEXT NOT NULL,
  "tokenHash"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "revokedAt"  TIMESTAMP(3),
  CONSTRAINT "OutreachDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OutreachDevice_tokenHash_key" ON "OutreachDevice"("tokenHash");
CREATE INDEX IF NOT EXISTS "OutreachDevice_memberId_idx" ON "OutreachDevice"("memberId");

DO $$ BEGIN
  ALTER TABLE "OutreachDevice"
    ADD CONSTRAINT "OutreachDevice_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "OutreachMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OutreachList" (
  "id"         TEXT NOT NULL,
  "teamId"     TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "position"   INTEGER NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'waiting',
  "consentAt"  TIMESTAMP(3) NOT NULL,
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "givenCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachList_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OutreachList_teamId_position_idx" ON "OutreachList"("teamId", "position");
CREATE INDEX IF NOT EXISTS "OutreachList_teamId_status_position_idx" ON "OutreachList"("teamId", "status", "position");

DO $$ BEGIN
  ALTER TABLE "OutreachList"
    ADD CONSTRAINT "OutreachList_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "OutreachTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OutreachContact" (
  "id"                  TEXT NOT NULL,
  "listId"              TEXT NOT NULL,
  "teamId"              TEXT NOT NULL,
  "phone"               TEXT NOT NULL,
  "name"                TEXT,
  "notes"               TEXT,
  "givenToMemberId"     TEXT,
  "givenAt"             TIMESTAMP(3),
  "givenBackAt"         TIMESTAMP(3),
  "givenBackByMemberId" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OutreachContact_listId_givenToMemberId_idx" ON "OutreachContact"("listId", "givenToMemberId");
CREATE INDEX IF NOT EXISTS "OutreachContact_teamId_phone_idx" ON "OutreachContact"("teamId", "phone");
CREATE INDEX IF NOT EXISTS "OutreachContact_teamId_givenToMemberId_givenAt_idx" ON "OutreachContact"("teamId", "givenToMemberId", "givenAt");

DO $$ BEGIN
  ALTER TABLE "OutreachContact"
    ADD CONSTRAINT "OutreachContact_listId_fkey"
    FOREIGN KEY ("listId") REFERENCES "OutreachList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- STEP 0b (22 Oct, audit hardening): per-member lifetime give-back count,
-- for the owner report's "many give-backs" flag - see lib/outreach/claim.ts
-- giveBack and lib/outreach/report.ts.
ALTER TABLE "OutreachMember" ADD COLUMN IF NOT EXISTS "giveBackCount" INTEGER NOT NULL DEFAULT 0;
