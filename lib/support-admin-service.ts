// Admin-side support helpers. SUPPORT-2 moved the live ticket writes to
// lib/support-tickets.ts; this file now only holds the admin-reply text
// convention (shared with staffReply) and the ticket-count badge.
import { prisma } from "./prisma";
import { activeConversationContacts } from "./crm-trash";

/**
 * Message body and customer-email text for an admin reply. A reply with
 * text uses it for both. A reply that is just a screenshot (no text) falls
 * back to the same "📎 Screenshot" history convention the customer-side
 * upload uses, but a friendlier line for the email, since "📎 Screenshot"
 * alone would be an odd thing to email.
 */
export function adminReplyContent(message: string, hasAttachment: boolean): { body: string; emailText: string } {
  const trimmed = message.trim();
  if (trimmed) return { body: trimmed, emailText: trimmed };
  if (hasAttachment) return { body: "📎 Screenshot", emailText: "Our team sent you a screenshot." };
  return { body: "", emailText: "" };
}

/** Server-side count of tickets needing attention (open|investigating), for the admin menu badge (SUPPORT-2: was conversation-based, now ticket-based - same function name, different query). Excludes tickets whose conversation's CRM lead was moved to Trash. */
export async function flaggedConversationCount(): Promise<number> {
  return prisma.supportTicket.count({ where: { status: { in: ["open", "investigating"] }, conversation: activeConversationContacts } });
}
