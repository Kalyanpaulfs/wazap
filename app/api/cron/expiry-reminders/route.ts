import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, isEmailConfigured, renderExpiryEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { basic: "Solo", pro: "Growth", ultimate: "Team", business: "Business" };
const DAY = 86_400_000;

// Daily cron. Reminds users whose paid plan expires within 3 days — but skips
// active card subscribers (Dodo auto-renews them). Emails the user
// (via Resend, if configured) and sends the admin a Telegram digest so they
// can personally follow up. Idempotent per billing cycle.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in3 = new Date(now.getTime() + 3 * DAY);
  const cardCutoff = new Date(now.getTime() - 32 * DAY);

  const candidates = await prisma.user.findMany({
    where: { plan: { not: "free" }, planExpiresAt: { gt: now, lte: in3 } },
    include: {
      payments: {
        where: { method: { in: ["card", "dodo"] }, status: "active", createdAt: { gte: cardCutoff } },
        take: 1,
      },
    },
  });

  const base = process.env.NEXTAUTH_URL ?? "https://wazap.lt";
  const configured = isEmailConfigured();
  let sent = 0, skippedAutoRenew = 0, skippedAlready = 0, needReminder = 0;
  const digest: string[] = [];

  for (const u of candidates) {
    const autoRenew = u.payments.length > 0;
    const days = Math.max(0, Math.ceil((u.planExpiresAt!.getTime() - now.getTime()) / DAY));
    const label = LABEL[u.plan] ?? u.plan;
    digest.push(`• ${u.name || u.email} — ${label}, ${days}d left${autoRenew ? " (card auto-renew)" : ""}`);

    if (autoRenew) { skippedAutoRenew++; continue; }
    if (
      u.expiryReminderSentFor && u.planExpiresAt &&
      u.expiryReminderSentFor.getTime() === u.planExpiresAt.getTime()
    ) { skippedAlready++; continue; }

    needReminder++;
    if (!configured) continue; // don't mark as sent — will fire once Resend is set up

    const ok = await sendEmail({
      to: u.email,
      subject: `Your Wazap ${label} plan expires in ${days} day${days !== 1 ? "s" : ""}`,
      html: renderExpiryEmail(u.name, label, days, base),
    });
    if (ok) {
      await prisma.user.update({ where: { id: u.id }, data: { expiryReminderSentFor: u.planExpiresAt } });
      sent++;
    }
  }

  // Admin Telegram digest (fires if a bot token + chat ids are configured).
  const token = process.env.SUPPORT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.SUPPORT_TELEGRAM_CHAT_IDS || process.env.TELEGRAM_ALLOW_USER_IDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (token && chatIds.length && candidates.length) {
    const text = `<b>Wazap — ${candidates.length} plan(s) expiring in ≤3 days</b>\n${digest.join("\n")}`;
    await Promise.allSettled(
      chatIds.map((chat_id) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }),
        })
      )
    );
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    needReminder,
    sent,
    skippedAutoRenew,
    skippedAlready,
    emailConfigured: configured,
  });
}
