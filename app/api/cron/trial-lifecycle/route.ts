import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderTrialReminderEmail, renderTrialEndedEmail } from "@/lib/email";
import { recordFunnelEvent } from "@/lib/funnel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  // "Ending" reminder: only once the trial has 1 day or less left - not
  // right after sign-up (every 3-day trial starts out <= 3 days left, so a
  // <= 3 day window used to fire it immediately).
  const in1Day = new Date(now.getTime() + 1 * 86_400_000);
  const [ending, expired] = await Promise.all([
    prisma.user.findMany({ where: { plan: "free", trialEndsAt: { gt: now, lte: in1Day }, trialReminderSentAt: null }, select: { id: true, email: true, name: true, trialEndsAt: true } }),
    // "Trial ended" email is only for someone who never had a paid plan (no
    // payment of theirs was ever activated). A user whose paid plan expired
    // and fell back to "free" gets the billing expiry notice instead (see
    // lib/payment-integrity.ts's queueBillingNotice state "expired") - not
    // this trial email, even if they also have old trial dates on record.
    prisma.user.findMany({
      where: { plan: "free", trialStartedAt: { not: null }, trialEndsAt: { lte: now }, payments: { none: { activatedAt: { not: null } } } },
      select: { id: true, email: true, name: true },
    }),
  ]);
  const base = process.env.NEXTAUTH_URL ?? "https://wazap.lt";
  for (const user of ending) {
    const days = Math.max(1, Math.ceil((user.trialEndsAt!.getTime() - now.getTime()) / 86_400_000));
    await prisma.$transaction([
      prisma.outboundEmail.create({ data: { userId: user.id, recipient: user.email, type: "trial_ending", subject: `Your Wazap free trial has ${days} day${days !== 1 ? "s" : ""} left`, html: renderTrialReminderEmail(user.name, days, base) } }),
      prisma.user.update({ where: { id: user.id }, data: { trialReminderSentAt: now } }),
    ]);
  }
  // Owner rule (Free-trial restructure): when the trial lapses, everything
  // pauses (see app/api/cron/expire-plans), so the user needs to be told.
  // recordFunnelEvent("trial_expired", ...) already dedupes per userId (see
  // lib/funnel.ts) - reuse that as the "already told them" guard, so this
  // email is queued exactly once per user with no new schema column needed.
  for (const user of expired) {
    const alreadyRecorded = await prisma.funnelEvent.findFirst({ where: { name: "trial_expired", userId: user.id }, select: { id: true } });
    await recordFunnelEvent("trial_expired", { userId: user.id, source: "trial_lifecycle" });
    if (!alreadyRecorded) {
      await prisma.outboundEmail.create({ data: { userId: user.id, recipient: user.email, type: "trial_ended", subject: "Your Wazap free trial has ended", html: renderTrialEndedEmail(user.name, base) } });
    }
  }
  return NextResponse.json({ ok: true, remindersQueued: ending.length, expiredRecorded: expired.length });
}
