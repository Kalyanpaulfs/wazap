import { queueBillingNotice } from "@/lib/billing-email";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPlanLimits } from "@/lib/plan-limit-sync";
import { recordBillingAttention } from "@/lib/billing-attention";

export const dynamic = "force-dynamic";

// Daily: downgrade any paid plan whose paid period has ended. Runs on a
// schedule so expiry is automatic (not only when the admin page loads).
// Active card subscriptions get their planExpiresAt extended by the LS
// renewal webhook BEFORE it lapses, so this only catches genuinely-ended ones.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const candidates = await prisma.user.findMany({where:{plan:{not:"free"},planExpiresAt:{not:null,lte:new Date()}},select:{id:true,email:true,name:true,plan:true,planExpiresAt:true}});
  let expired=0;
  for(const user of candidates){
    const changed=await prisma.$transaction(async tx=>{
      const result=await tx.user.updateMany({where:{id:user.id,plan:user.plan,planExpiresAt:user.planExpiresAt},data:{plan:"free",planExpiresAt:null}});
      if(result.count)await queueBillingNotice({key:`expiry:${user.id}:${user.planExpiresAt!.toISOString()}`,userId:user.id,email:user.email,name:user.name,plan:user.plan,state:"expired",accessUntil:user.planExpiresAt},tx);
      return result.count;
    });
    if(changed){
      // user.plan is the plan read BEFORE this downgrade (candidates were
      // queried before the updateMany) - a genuine paid-to-free downgrade.
      try{await syncPlanLimits(user.id,user.plan);}
      catch(err){console.error("[plan-limit-sync] failed after expiry downgrade",user.id,err instanceof Error?err.message:String(err));}
    }
    expired+=changed;
  }

  // Owner rule (Free-trial restructure, FEAT-FREE-TRIAL): anyone on plan
  // "free" with no active Free trial gets nothing - every rotator, short
  // link and ad link must be plan-paused, no matter how they arrived there
  // (trial just lapsed, an old trial, never trialled, or legacy
  // grandfathered free limits from before this restructure). Sweep every
  // such user who still has an un-paused link. syncPlanLimits treats a
  // "free" link plan as always-pausable now (see lib/plan-limit-sync.ts), so
  // no previousPlan needs to be resolved here. Self-draining: once paused,
  // a user no longer matches this query, so a bounded batch per run (500)
  // catches up over a few runs, including the one-time backfill of existing
  // free users the first time this ships. syncPlanLimits is itself a no-op
  // while PLAN_LIMIT_PAUSING_ENABLED is off, so this is safe to ship ahead
  // of turning that flag on.
  const trialCandidates = await prisma.user.findMany({
    where: {
      plan: "free",
      OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: new Date() } }],
      AND: [
        {
          OR: [
            { rotatorLinks: { some: { planPausedAt: null } } },
            { shortLinks: { some: { planPausedAt: null } } },
            { adLinks: { some: { planPausedAt: null } } },
          ],
        },
      ],
    },
    select: { id: true },
    take: 500,
  });
  let trialSynced = 0;
  for (const user of trialCandidates) {
    try { await syncPlanLimits(user.id); trialSynced++; }
    catch (err) { console.error("[plan-limit-sync] failed for free/no-trial user", user.id, err instanceof Error ? err.message : String(err)); }
  }

  // A refund still 'requested' after 15 minutes means the server stopped
  // mid-refund: the money may or may not have gone back. Never retry it
  // automatically (could refund twice) - flag it for a human to check.
  const stuckRefunds = await prisma.billingRefund.findMany({
    where: { status: "requested", createdAt: { lte: new Date(Date.now() - 15 * 60_000) } },
    take: 100,
  });
  for (const refund of stuckRefunds) {
    const payment = await prisma.payment.findUnique({ where: { id: refund.paymentId }, select: { userId: true, email: true, txId: true } });
    await recordBillingAttention({
      provider: refund.provider === "dodo" ? "dodo" : "paypal", eventId: `refund-stuck:${refund.id}`, eventType: "refund_stuck",
      reason: "Refund was started but never confirmed. Check the provider dashboard: if refunded there, mark resolved; if not, refund again.",
      chargeId: payment?.txId ?? null, userId: payment?.userId ?? null, email: payment?.email ?? null, amount: refund.amount, currency: refund.currency,
    });
  }

  return NextResponse.json({ ok: true, expired, trialSynced, stuckRefunds: stuckRefunds.length });
}
