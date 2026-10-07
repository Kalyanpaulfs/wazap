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
}) {
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

export async function notifySupportChat(input: {
  name?: string | null;
  email?: string | null;
  message: string;
  conversationId: string;
}) {
  const token = process.env.SUPPORT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = getTelegramChatIds();
  if (!token || chatIds.length === 0) return;

  const adminUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt"}/admin/crm/support?chat=${encodeURIComponent(input.conversationId)}`;
  const text = [
    "<b>New Wazap live chat message</b>",
    `Name: ${escapeTelegram(input.name || "Website visitor")}`,
    `Email: ${escapeTelegram(input.email || "Not provided yet")}`,
    "",
    escapeTelegram(input.message).slice(0, 2500),
    "",
    `<a href="${escapeTelegram(adminUrl)}">Open live chat inbox</a>`,
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
