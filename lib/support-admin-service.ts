// Admin-side writes for the support inbox: replying to a chat (which also
// emails the customer a "continue the chat" link) and opening/closing a
// conversation. Split out of app/api/admin/support/route.ts so the route
// only has to handle auth + request shape, and scripts/support-flow-check.ts
// can call the same functions directly without a real admin session.
import { prisma } from "./prisma";
import { createContinueToken } from "./support-session";
import { renderSupportChatContinueEmail } from "./email";
import { activeCrmContacts } from "./crm-trash";

export type ReplyToConversationResult = { conversationId: string; outboundEmailId: string | null } | null;

export async function replyToConversation(conversationId: string, message: string): Promise<ReplyToConversationResult> {
  const conversation = await prisma.supportConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return null;
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";

  return prisma.$transaction(async tx => {
    await tx.supportChatMessage.create({ data: { conversationId, sender: "admin", body: message, readByAdmin: true } });
    await tx.supportConversation.update({ where: { id: conversationId }, data: { status: "open", lastMessageAt: new Date() } });
    if (conversation.crmLeadId) await tx.crmActivity.create({ data: { leadId: conversation.crmLeadId, kind: "support_reply", body: `Support reply: ${message}` } });

    let outboundEmailId: string | null = null;
    if (conversation.email) {
      const token = createContinueToken(conversation.visitorId);
      const continueUrl = `${base}/support/continue?t=${encodeURIComponent(token)}`;
      const outbound = await tx.outboundEmail.create({
        data: {
          recipient: conversation.email.toLowerCase(),
          type: "support_chat_reply",
          subject: "Wazap support replied to your chat",
          html: renderSupportChatContinueEmail({ name: conversation.name, reply: message, continueUrl }),
        },
      });
      outboundEmailId = outbound.id;
      if (conversation.crmLeadId) {
        await tx.crmActivity.upsert({
          where: { sourceKey: "support-chat-outbound:" + outbound.id },
          create: { leadId: conversation.crmLeadId, kind: "support_thread", body: conversationId, sourceKey: "support-chat-outbound:" + outbound.id },
          update: {},
        });
      }
    }

    return { conversationId, outboundEmailId };
  });
}

export async function setConversationStatus(conversationId: string, status: "open" | "closed") {
  return prisma.supportConversation.update({ where: { id: conversationId }, data: { status } });
}

/** Server-side count of flagged ("needs you") chats, for the admin menu badge. Matches the same trashed-lead exclusion as the inbox list. */
export async function flaggedConversationCount(): Promise<number> {
  return prisma.supportConversation.count({ where: { status: "open", OR: [{ crmLeadId: null }, { crmLead: activeCrmContacts }] } });
}
