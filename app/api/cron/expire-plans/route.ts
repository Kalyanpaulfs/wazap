import { queueBillingNotice } from "@/lib/billing-email";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPlanLimits, isNewStyleTrial } from "@/lib/plan-limit-sync";
import { PRODUCT_TRIAL_PLAN } from "@/lib/entitlements";
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

  // Trial end never otherwise runs the pause engine - a user whose product
  // trial lapsed without upgrading can be sitting on trial-era extras over
  // the free plan's real limits. Catch those within a lookback window (wider
  // than the cron interval so a missed run never skips anyone), capped to a
  // bounded batch per run. syncPlanLimits is itself a no-op while the flag
  // is off, so this is safe to ship ahead of turning it on.
  const trialLookback = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const trialCandidates = await prisma.user.findMany({
    where: { plan: "free", trialEndsAt: { not: null, lte: new Date(), gte: trialLookback } },
    select: { id: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true },
    take: 500,
  });
  let trialSynced = 0;
  for (const user of trialCandidates) {
    // These users' `plan` column was "free" before and stays "free" now, so
    // there is no real plan-column change to read a previousPlan from - the
    // whole point of this sweep. Only a NEW-style trial (<=4 days) ever had
    // Growth-level rotator/short-link/ad-link limits to begin with
    // (isNewStyleTrial grandfathers old 14-day trials out): for those, pass
    // the trial plan itself as previousPlan so syncPlanLimits's downgrade
    // check (via previousLinkPlanFor) can see the drop back to free and pause
    // the extras. Anyone else gets no previousPlan - isLinkDowngrade's normal
    // fail-safe (no pause) applies, exactly as before this feature.
    // Automations/AI/channels/etc. are unaffected by this gate either way.
    const previousPlan = isNewStyleTrial(user) ? (user.trialPlan || PRODUCT_TRIAL_PLAN) : undefined;
    try { await syncPlanLimits(user.id, previousPlan); trialSynced++; }
    catch (err) { console.error("[plan-limit-sync] failed after trial end", user.id, err instanceof Error ? err.message : String(err)); }
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
