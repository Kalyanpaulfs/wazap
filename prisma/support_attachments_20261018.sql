-- Screenshot attachments for the support chat widget (max 5 MB, PNG/JPEG/
-- WebP, verified by magic bytes at upload time - see lib/support-attachment.ts
-- and app/api/support/attachment/route.ts). Bytes are stored in Postgres, not
-- the filesystem, because a deploy replaces folders. Additive only: safe to
-- run on production.
CREATE TABLE IF NOT EXISTS "SupportAttachment" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupportAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupportAttachment_conversationId_idx" ON "SupportAttachment"("conversationId");
CREATE INDEX IF NOT EXISTS "SupportAttachment_messageId_idx" ON "SupportAttachment"("messageId");
CREATE INDEX IF NOT EXISTS "SupportAttachment_conversationId_createdAt_idx" ON "SupportAttachment"("conversationId", "createdAt");
