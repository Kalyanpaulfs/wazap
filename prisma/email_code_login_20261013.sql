-- Passwordless email-code sign-in (SEC-1). Additive only: safe to run on production.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "EmailCode" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmailCode_email_purpose_createdAt_idx" ON "EmailCode"("email", "purpose", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailCode_expiresAt_idx" ON "EmailCode"("expiresAt");

-- Google already verified these addresses.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "googleSubject" IS NOT NULL AND "emailVerifiedAt" IS NULL;
