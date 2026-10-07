CREATE TABLE "ApiIdempotencyRecord" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "apiKeyId" TEXT,
  "keyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "statusCode" INTEGER,
  "response" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiIdempotencyRecord_keyHash_key" ON "ApiIdempotencyRecord"("keyHash");
CREATE INDEX "ApiIdempotencyRecord_workspaceId_createdAt_idx" ON "ApiIdempotencyRecord"("workspaceId", "createdAt");
CREATE INDEX "ApiIdempotencyRecord_apiKeyId_createdAt_idx" ON "ApiIdempotencyRecord"("apiKeyId", "createdAt");
CREATE INDEX "ApiIdempotencyRecord_expiresAt_idx" ON "ApiIdempotencyRecord"("expiresAt");

ALTER TABLE "ApiIdempotencyRecord"
  ADD CONSTRAINT "ApiIdempotencyRecord_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiIdempotencyRecord"
  ADD CONSTRAINT "ApiIdempotencyRecord_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
