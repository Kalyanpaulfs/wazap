-- TOOL-FREE-2: Link shortener (free tool, any website URL - not WhatsApp;
-- see app/w, app/r, app/a for the existing WhatsApp-only short links).
-- Additive only, safe to run on production. Idempotent: IF NOT EXISTS
-- everywhere, so it is safe to run more than once.
-- See prisma/schema.prisma (ShortUrl/ShortUrlReport) and kalyan.md TOOL-FREE-2.

CREATE TABLE IF NOT EXISTS "ShortUrl" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "targetUrl"      TEXT NOT NULL,
  "title"          TEXT,
  "clicks"         INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt"     TIMESTAMP(3),
  "disabledReason" TEXT,
  "reportCount"    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ShortUrl_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShortUrl_code_key" ON "ShortUrl"("code");
CREATE INDEX IF NOT EXISTS "ShortUrl_userId_idx" ON "ShortUrl"("userId");
CREATE INDEX IF NOT EXISTS "ShortUrl_userId_createdAt_idx" ON "ShortUrl"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ShortUrl"
    ADD CONSTRAINT "ShortUrl_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ShortUrlReport" (
  "id"         TEXT NOT NULL,
  "shortUrlId" TEXT NOT NULL,
  "reason"     TEXT NOT NULL,
  "reporterIp" TEXT NOT NULL,
  "details"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShortUrlReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ShortUrlReport_shortUrlId_idx" ON "ShortUrlReport"("shortUrlId");

DO $$ BEGIN
  ALTER TABLE "ShortUrlReport"
    ADD CONSTRAINT "ShortUrlReport_shortUrlId_fkey"
    FOREIGN KEY ("shortUrlId") REFERENCES "ShortUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
