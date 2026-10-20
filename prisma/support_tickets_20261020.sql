-- SUPPORT-2: ticket system (no AI). SupportConversation stays the per-
-- visitor container (profile, CRM link, support-session cookie); every
-- message now belongs to a SupportTicket instead of living loose on the
-- conversation. Additive only, safe to run on production, idempotent
-- (IF NOT EXISTS everywhere, backfill skips conversations that already have
-- a ticket). See prisma/schema.prisma, lib/support-tickets.ts and
-- lib/support-ticket-rules.ts.

ALTER TABLE "SupportConversation" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "SupportChatMessage" ADD COLUMN IF NOT EXISTS "ticketId" TEXT;

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT,
  "topic" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "urgent" BOOLEAN NOT NULL DEFAULT false,
  "priority" BOOLEAN NOT NULL DEFAULT false,
  "assignedToId" TEXT,
  "quickAnswerId" TEXT,
  "parentTicketId" TEXT,
  "waitingSince" TIMESTAMP(3),
  "firstReplyAt" TIMESTAMP(3),
  "lastAdminReplyAt" TIMESTAMP(3),
  "lastCustomerEmailAt" TIMESTAMP(3),
  "urgentEscalatedAt" TIMESTAMP(3),
  "solvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_number_key" ON "SupportTicket"("number");
CREATE INDEX IF NOT EXISTS "SupportTicket_conversationId_status_idx" ON "SupportTicket"("conversationId", "status");
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_waitingSince_idx" ON "SupportTicket"("status", "waitingSince");

DO $$ BEGIN
  ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SupportChatMessage"
    ADD CONSTRAINT "SupportChatMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "SupportChatMessage_ticketId_createdAt_idx" ON "SupportChatMessage"("ticketId", "createdAt");

CREATE TABLE IF NOT EXISTS "SupportAnswerFeedback" (
  "id" TEXT NOT NULL,
  "answerId" TEXT NOT NULL,
  "solved" BOOLEAN NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAnswerFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupportAnswerFeedback_answerId_createdAt_idx" ON "SupportAnswerFeedback"("answerId", "createdAt");

-- Backfill: one ticket per existing conversation that has messages. Status
-- is decided by the LAST message on the conversation, not just the
-- conversation's own status field:
--   - conversation status 'closed' or 'ai' -> closed (ai conversations
--     never got a human reply, so they're treated the same as closed).
--   - otherwise, if the LAST message was sent by 'admin' or 'bot' -> closed
--     (staff already answered everything on this conversation; never feed
--     this into the auto-solve/reply-email flow, and no backfill email).
--   - otherwise (the customer spoke last) -> open, with waitingSince set to
--     the createdAt of the earliest VISITOR message after the last admin
--     message (or the earliest visitor message at all, if there was never
--     an admin message; falling back to the conversation's createdAt if
--     for some reason neither exists).
-- Skips any conversation that already has a ticket, and only ever sets
-- ticketId where it is still NULL - safe to run more than once.
DO $$
DECLARE
  conv RECORD;
  new_id TEXT;
  new_number TEXT;
  attempt INT;
  mapped_status TEXT;
  last_sender TEXT;
  last_admin_at TIMESTAMP(3);
  waiting_since TIMESTAMP(3);
BEGIN
  FOR conv IN
    SELECT c."id" AS id, c."status" AS status, c."createdAt" AS "createdAt"
    FROM "SupportConversation" c
    WHERE EXISTS (SELECT 1 FROM "SupportChatMessage" m WHERE m."conversationId" = c."id")
      AND NOT EXISTS (SELECT 1 FROM "SupportTicket" t WHERE t."conversationId" = c."id")
  LOOP
    new_id := 'bft_' || substr(md5(conv.id || clock_timestamp()::text || random()::text), 1, 24);

    SELECT m."sender" INTO last_sender
    FROM "SupportChatMessage" m
    WHERE m."conversationId" = conv.id
    ORDER BY m."createdAt" DESC, m."id" DESC
    LIMIT 1;

    waiting_since := NULL;

    IF conv.status = 'closed' OR conv.status = 'ai' THEN
      mapped_status := 'closed';
    ELSIF last_sender = 'admin' OR last_sender = 'bot' THEN
      mapped_status := 'closed';
    ELSE
      mapped_status := 'open';

      SELECT MAX(m."createdAt") INTO last_admin_at
      FROM "SupportChatMessage" m
      WHERE m."conversationId" = conv.id AND m."sender" IN ('admin', 'bot');

      IF last_admin_at IS NOT NULL THEN
        SELECT MIN(m."createdAt") INTO waiting_since
        FROM "SupportChatMessage" m
        WHERE m."conversationId" = conv.id AND m."sender" = 'visitor' AND m."createdAt" > last_admin_at;
      ELSE
        SELECT MIN(m."createdAt") INTO waiting_since
        FROM "SupportChatMessage" m
        WHERE m."conversationId" = conv.id AND m."sender" = 'visitor';
      END IF;

      IF waiting_since IS NULL THEN
        waiting_since := conv."createdAt";
      END IF;
    END IF;

    attempt := 0;
    LOOP
      new_number := upper(substr(md5(conv.id || ':' || attempt::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "SupportTicket" WHERE "number" = new_number);
      attempt := attempt + 1;
    END LOOP;

    INSERT INTO "SupportTicket" ("id", "number", "conversationId", "topic", "status", "waitingSince", "closedAt", "createdAt", "updatedAt")
    VALUES (
      new_id,
      new_number,
      conv.id,
      'other',
      mapped_status,
      CASE WHEN mapped_status = 'open' THEN waiting_since ELSE NULL END,
      CASE WHEN mapped_status = 'closed' THEN conv."createdAt" ELSE NULL END,
      conv."createdAt",
      CURRENT_TIMESTAMP
    );

    UPDATE "SupportChatMessage"
    SET "ticketId" = new_id
    WHERE "conversationId" = conv.id AND "ticketId" IS NULL;
  END LOOP;
END $$;
