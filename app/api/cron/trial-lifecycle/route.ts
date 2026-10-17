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
  const in3Days = new Date(now.getTime() + 3 * 86_400_000);
  const [ending, expired] = await Promise.all([
    prisma.user.findMany({ where: { plan: "free", trialEndsAt: { gt: now, lte: in3Days }, trialReminderSentAt: null }, select: { id: true, email: true, name: true, trialEndsAt: true } }),
    prisma.user.findMany({ where: { plan: "free", trialStartedAt: { not: null }, trialEndsAt: { lte: now } }, select: { id: true, email: true, name: true } }),
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
