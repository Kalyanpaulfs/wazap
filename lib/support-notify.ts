import { prisma } from './prisma';
import { serviceEmail } from './customer-email';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

export async function queueSupportAlert(input: { eventKey: string; name?: string | null; email?: string | null; subject: string; message: string; link?: string }, db: Prisma.TransactionClient = prisma) {
  const event = createHash('sha256').update(input.eventKey).digest('hex');
  await db.outboundEmail.createMany({ skipDuplicates: true, data: ['support@wazap.lt', 'joseph@wazap.lt'].map(recipient => ({
    id: `support_team_${event}_${recipient.split('@')[0]}`, recipient, type: 'support_live_team_alert',
    subject: input.subject,
    html: serviceEmail({ subject: input.subject, heading: input.subject, channel: 'support', body: `${input.name || input.email ? `Name: ${input.name || 'Website visitor'}\nEmail: ${input.email || 'Not provided'}\n\n` : ''}${input.message}\n\nOpen support: ${input.link || 'https://wazap.lt/admin/crm/support'}` }),
  })) });
}

function getTelegramChatIds() {
  return (process.env.SUPPORT_TELEGRAM_CHAT_IDS || process.env.TELEGRAM_ALLOW_USER_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);
}

function escapeTelegram(text: string) {
  return text.replace(/[<>&]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] ?? char));
}

export async function notifySupportMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  requestId?: string;
}) {
  await queueSupportAlert({ eventKey: 'request:' + (input.requestId || randomUUID()), name: input.name, email: input.email, subject: 'New Wazap support request: ' + input.subject, message: input.message });
  const token = process.env.SUPPORT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = getTelegramChatIds();
  if (!token || chatIds.length === 0) return;

  const text = [
    "<b>New Wazap support request</b>",
    `Name: ${escapeTelegram(input.name)}`,
    `Email: ${escapeTelegram(input.email)}`,
    `Subject: ${escapeTelegram(input.subject)}`,
    "",
    escapeTelegram(input.message).slice(0, 2500),
  ].join("\n");

  await Promise.allSettled(
    chatIds.map(chat_id =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      })
    )
  );
}

// Telegram-only half of a new ticket (the email half is the caller's
// responsibility via queueSupportAlert directly - see
// lib/support-tickets.ts createTicket - so the alert gets its own
// subject/body instead of this generic one, and isn't sent twice under two
// different eventKeys).
export async function notifySupportChatTelegram(input: {
  name?: string | null;
  email?: string | null;
  message: string;
  ticketId: string;
  ticketNumber?: string;
}) {
  const token = process.env.SUPPORT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = getTelegramChatIds();
  if (!token || chatIds.length === 0) return;

  const adminUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt"}/admin/crm/support?ticket=${encodeURIComponent(input.ticketId)}`;
  const text = [
    `<b>New Wazap support ticket${input.ticketNumber ? ` #${escapeTelegram(input.ticketNumber)}` : ""}</b>`,
    `Name: ${escapeTelegram(input.name || "Website visitor")}`,
    `Email: ${escapeTelegram(input.email || "Not provided yet")}`,
    "",
    escapeTelegram(input.message).slice(0, 2500),
    "",
    `<a href="${escapeTelegram(adminUrl)}">Open support ticket</a>`,
  ].join("\n");

  await Promise.allSettled(
    chatIds.map(chat_id =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      })
    )
  );
}

export async function notifySupportReplySeen(input: {
  name?: string | null;
  email: string;
  subject: string;
  seenAt: Date;
}) {
  const token = process.env.SUPPORT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = getTelegramChatIds();
  if (!token || chatIds.length === 0) return;

  const adminUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt"}/admin`;
  const text = [
    "<b>Wazap support reply seen</b>",
    `Customer: ${escapeTelegram(input.name || input.email)}`,
    `Email: ${escapeTelegram(input.email)}`,
    `Subject: ${escapeTelegram(input.subject)}`,
    `Seen: ${escapeTelegram(input.seenAt.toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))} Dubai`,
    "",
    `<a href="${escapeTelegram(adminUrl)}">Open Wazap admin</a>`,
  ].join("\n");

  await Promise.allSettled(
    chatIds.map(chat_id =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      })
    )
  );
}
