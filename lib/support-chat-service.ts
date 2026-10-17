// DB-touching half of the "AI first, human when needed" support flow. Pure
// decision logic lives in lib/support-handoff.ts; this module wires those
// decisions into Prisma writes and the team-alert email, shared by
// app/api/chatbot/route.ts, app/api/support/chat/route.ts and
// scripts/support-flow-check.ts (so the integration-style script can call
// the exact same code the routes call, without needing a real session/
// cookie).
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { decideSupportAlert, evaluateHandoff, handoffMessage, supportReference, type HandoffAiAnswer } from "./support-handoff";
import { SUPPORT_REPLY_TARGET_HOURS } from "./support-queue";
import { notifySupportChatTelegram, queueSupportAlert } from "./support-notify";

export type ChatbotTurnInput = {
  visitorId: string;
  message: string;
  answer: HandoffAiAnswer;
  reply: string;
  intent: string;
  leadScore: number;
  crmLeadId?: string | null;
};

export type HandoffPayload = { reference: string; replyWithinHours: number; message: string };

export type ChatbotTurnResult = {
  conversationId: string;
  supportRequest: boolean;
  handoff: HandoffPayload | null;
};

function supportAdminLink(conversationId: string) {
  return `https://wazap.lt/admin/crm/support?chat=${encodeURIComponent(conversationId)}`;
}

async function sendHandoffAlert(db: Prisma.TransactionClient, opts: { conversationId: string; incomingMessageId: string; name: string | null; email: string | null; reason: string | null; message: string }) {
  const reference = supportReference(opts.conversationId);
  const summary = (opts.reason || opts.message || "New message").slice(0, 80);
  await queueSupportAlert({
    eventKey: "handoff:" + opts.conversationId + ":" + opts.incomingMessageId,
    name: opts.name,
    email: opts.email,
    subject: `Needs you: ${reference} — ${summary}`,
    message: `Reason: ${opts.reason || "Not specified"}\nLast customer message: ${opts.message}`,
    link: supportAdminLink(opts.conversationId),
  }, db);
}

/** Records one visitor turn in the AI chatbot (app/api/chatbot/route.ts). */
export async function recordChatbotTurn(input: ChatbotTurnInput): Promise<ChatbotTurnResult> {
  const visitorId = input.visitorId.trim().slice(0, 120);
  const message = input.message.trim().slice(0, 4000);
  const existing = await prisma.supportConversation.findUnique({
    where: { visitorId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const previousStatus = existing?.status ?? null;
  const lastMessageSender = existing?.messages[0]?.sender ?? null;
  const { flagged: flaggedNow, reason } = evaluateHandoff(message, input.answer);
  const decision = decideSupportAlert({ previousStatus, lastMessageSender, flaggedNow });
  const status = decision.flagged ? "open" : "ai";

  const outcome = await prisma.$transaction(async tx => {
    const saved = await tx.supportConversation.upsert({
      where: { visitorId },
      create: { visitorId, subject: "AI sales chat", status, intent: input.intent, leadScore: input.leadScore, aiSummary: message.slice(0, 500), lastMessageAt: new Date() },
      update: { status, intent: existing?.intent === "purchase" ? "purchase" : input.intent, leadScore: Math.max(existing?.leadScore ?? 0, input.leadScore), aiSummary: message.slice(0, 500), lastMessageAt: new Date() },
    });

    const incoming = await tx.supportChatMessage.create({ data: { conversationId: saved.id, sender: "visitor", body: message, readByVisitor: true } });
    await tx.supportChatMessage.create({ data: { conversationId: saved.id, sender: "bot", body: input.reply, readByAdmin: false, readByVisitor: true } });

    let handoff: HandoffPayload | null = null;
    if (decision.flagged) {
      const reference = supportReference(saved.id);
      const handoffText = handoffMessage(reference, SUPPORT_REPLY_TARGET_HOURS);
      handoff = { reference, replyWithinHours: SUPPORT_REPLY_TARGET_HOURS, message: handoffText };
      // Only save the handoff text to history on the flag transition (new
      // flag or re-flag) - not on every subsequent message while already
      // flagged and waiting on the admin.
      if (decision.shouldAlert) {
        await tx.supportChatMessage.create({ data: { conversationId: saved.id, sender: "bot", body: handoffText, readByAdmin: false, readByVisitor: true } });
      }
    }

    if (decision.shouldAlert) {
      await sendHandoffAlert(tx, { conversationId: saved.id, incomingMessageId: incoming.id, name: saved.name, email: saved.email, reason, message });
    }

    if (input.crmLeadId) await tx.crmLead.update({ where: { id: input.crmLeadId }, data: { lastActivityAt: new Date() } });

    return { conversationId: saved.id, name: saved.name, email: saved.email, messageId: incoming.id, handoff };
  });

  if (decision.shouldAlert) {
    await notifySupportChatTelegram({ name: outcome.name || "Wazap enquiry", email: outcome.email, message, conversationId: outcome.conversationId });
  }

  return { conversationId: outcome.conversationId, supportRequest: decision.flagged, handoff: outcome.handoff };
}

export type AttachmentTurnInput = {
  visitorId: string;
  caption: string | null;
  mimeType: string;
  size: number;
  data: Buffer;
};

export type AttachmentTurnResult = { conversationId: string; messageId: string; attachmentId: string; handoff: HandoffPayload };

/**
 * Records one visitor screenshot upload (app/api/support/attachment/route.ts).
 * The AI cannot see images, so an attachment always flags the chat for the
 * team - same decideSupportAlert/sendHandoffAlert rule as the text flows
 * above, so there is no extra email if the chat is already flagged.
 * Caller (the route) must already have verified the conversation exists
 * with contact captured, the file's size/type, and the per-conversation
 * rate limit.
 */
export async function recordAttachmentTurn(input: AttachmentTurnInput): Promise<AttachmentTurnResult> {
  const visitorId = input.visitorId.trim().slice(0, 120);
  const caption = input.caption?.trim().slice(0, 4000) || null;
  const body = caption || "📎 Screenshot";
  const existing = await prisma.supportConversation.findUniqueOrThrow({
    where: { visitorId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const previousStatus = existing.status;
  const lastMessageSender = existing.messages[0]?.sender ?? null;
  const decision = decideSupportAlert({ previousStatus, lastMessageSender, flaggedNow: true });
  const reference = supportReference(existing.id);
  const handoffText = handoffMessage(reference, SUPPORT_REPLY_TARGET_HOURS);
  const handoff: HandoffPayload = { reference, replyWithinHours: SUPPORT_REPLY_TARGET_HOURS, message: handoffText };

  const outcome = await prisma.$transaction(async tx => {
    const saved = await tx.supportConversation.update({ where: { id: existing.id }, data: { status: "open", lastMessageAt: new Date() } });

    const incoming = await tx.supportChatMessage.create({ data: { conversationId: saved.id, sender: "visitor", body, readByVisitor: true } });
    const attachment = await tx.supportAttachment.create({ data: { conversationId: saved.id, messageId: incoming.id, mimeType: input.mimeType, size: input.size, data: input.data } });

    // Same rule as recordChatbotTurn: only save the handoff text to history
    // on the transition into flagged (or re-flag), not on every subsequent
    // attachment while already flagged and waiting on the admin.
    if (decision.shouldAlert) {
      await tx.supportChatMessage.create({ data: { conversationId: saved.id, sender: "bot", body: handoffText, readByAdmin: false, readByVisitor: true } });
      await sendHandoffAlert(tx, { conversationId: saved.id, incomingMessageId: incoming.id, name: saved.name, email: saved.email, reason: "Customer sent a screenshot", message: body });
    }

    if (existing.crmLeadId) await tx.crmLead.update({ where: { id: existing.crmLeadId }, data: { lastActivityAt: new Date() } });

    return { conversationId: saved.id, name: saved.name, email: saved.email, messageId: incoming.id, attachmentId: attachment.id };
  });

  if (decision.shouldAlert) {
    await notifySupportChatTelegram({ name: outcome.name, email: outcome.email, message: body, conversationId: outcome.conversationId });
  }

  return { conversationId: outcome.conversationId, messageId: outcome.messageId, attachmentId: outcome.attachmentId, handoff };
}

export type LiveChatTurnInput = {
  visitorId: string;
  message: string;
  name?: string | null;
  email?: string | null;
  subject: string;
  crmLeadId?: string | null;
};

export type LiveChatTurnResult = { conversationId: string; messageId: string };

/** Records one visitor turn in the older direct-to-human endpoint (app/api/support/chat/route.ts). There is no AI here, so every message is "AI unavailable" -> always flagged; only the alert is deduped. */
export async function recordLiveChatTurn(input: LiveChatTurnInput): Promise<LiveChatTurnResult> {
  const visitorId = input.visitorId.trim().slice(0, 120);
  const message = input.message.trim().slice(0, 4000);
  const existing = await prisma.supportConversation.findUnique({
    where: { visitorId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const previousStatus = existing?.status ?? null;
  const lastMessageSender = existing?.messages[0]?.sender ?? null;
  const { reason } = evaluateHandoff(message, null);
  const decision = decideSupportAlert({ previousStatus, lastMessageSender, flaggedNow: true });

  const outcome = await prisma.$transaction(async tx => {
    const saved = await tx.supportConversation.upsert({
      where: { visitorId },
      create: { visitorId, email: input.email || null, name: input.name || null, subject: input.subject, status: "open", lastMessageAt: new Date() },
      update: { ...(input.email ? { email: input.email } : {}), ...(input.name ? { name: input.name } : {}), subject: input.subject, status: "open", lastMessageAt: new Date() },
    });

    const incoming = await tx.supportChatMessage.create({ data: { conversationId: saved.id, sender: "visitor", body: message, readByVisitor: true } });

    if (input.crmLeadId) await tx.crmLead.update({ where: { id: input.crmLeadId }, data: { lastActivityAt: new Date() } });

    if (decision.shouldAlert) {
      await sendHandoffAlert(tx, { conversationId: saved.id, incomingMessageId: incoming.id, name: saved.name, email: saved.email, reason, message });
    }

    return { conversationId: saved.id, name: saved.name, email: saved.email, messageId: incoming.id };
  });

  if (decision.shouldAlert) {
    await notifySupportChatTelegram({ name: outcome.name || input.name || null, email: outcome.email || input.email || null, message, conversationId: outcome.conversationId });
  }

  return { conversationId: outcome.conversationId, messageId: outcome.messageId };
}
