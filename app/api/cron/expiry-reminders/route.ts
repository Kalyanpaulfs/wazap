import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, isEmailConfigured, renderExpiryEmail } from "@/lib/email";
import { PLAN_NAMES } from "@/lib/billing";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

// Daily cron. Reminds users whose paid plan expires within 3 days — but skips
// anyone whose subscription will auto-renew (PayPal or Dodo — see
// lib/billing-summary.ts's same SecurityUserBilling.autoRenew read). Emails
// the user (via Resend, if configured) and sends the admin a Telegram digest
// so they can personally follow up. Idempotent per billing cycle.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in3 = new Date(now.getTime() + 3 * DAY);

  const candidates = await prisma.user.findMany({
    where: { plan: { not: "free" }, planExpiresAt: { gt: now, lte: in3 } },
    include: {
      securityBillingState: { select: { autoRenew: true } },
    },
  });

  const base = process.env.NEXTAUTH_URL ?? "https://wazap.lt";
  const configured = isEmailConfigured();
  let sent = 0, skippedAutoRenew = 0, skippedAlready = 0, needReminder = 0;
  const digest: string[] = [];

  for (const u of candidates) {
    // Default to true (auto-renew) when there is no billing pointer yet,
    // matching lib/billing-summary.ts's getBillingSummary — the same rule
    // used to show "Auto-pay on" in app/billing.
    const autoRenew = u.securityBillingState?.autoRenew ?? true;
    const days = Math.max(0, Math.ceil((u.planExpiresAt!.getTime() - now.getTime()) / DAY));
    const label = PLAN_NAMES[u.plan] ?? u.plan;
    digest.push(`• ${u.name || u.email} — ${label}, ${days}d left${autoRenew ? " (auto-renews)" : ""}`);

    if (autoRenew) { skippedAutoRenew++; continue; }
    if (
      u.expiryReminderSentFor && u.planExpiresAt &&
      u.expiryReminderSentFor.getTime() === u.planExpiresAt.getTime()
    ) { skippedAlready++; continue; }

    needReminder++;
    if (!configured) continue; // don't mark as sent — will fire once Resend is set up

    const result = await sendEmail({
      channel: "billing",
      to: u.email,
      subject: `Your Wazap ${label} plan expires in ${days} day${days !== 1 ? "s" : ""}`,
      html: renderExpiryEmail(u.name, label, days, base),
    });
    if (result.accepted) {
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
