import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { queueBillingNotice, queuePaidReceipt } from "./billing-email";
import { extendPlanExpiry, planExpiry, withGrace } from "./billing";
import { recordCrmPayment } from "./crm-payment";

async function subscriptionRecord(tx: Prisma.TransactionClient, opts: { provider: string; subscriptionId: string; userId: string; plan: string }, email: string, status: "subscription_active" | "subscription_inactive") {
  const existing = await tx.payment.findFirst({ where: { userId: opts.userId, method: opts.provider, txId: opts.subscriptionId, status: { in: ["pending", "inactive", "subscription_active", "subscription_inactive"] } } });
  if (existing) await tx.payment.updateMany({ where: { userId: opts.userId, method: opts.provider, txId: opts.subscriptionId, status: { in: ["pending", "inactive", "subscription_active", "subscription_inactive"] } }, data: { status, activatedAt: new Date() } });
  else await tx.payment.create({ data: { userId: opts.userId, email, plan: opts.plan, amount: 0, currency: "USD", method: opts.provider, txId: opts.subscriptionId, status, activatedAt: new Date() } });
}

export async function recordVerifiedCharge(opts: {
  provider: "dodo" | "paypal"; chargeId: string; userId: string; plan: string;
  amount: number; currency: string; subscriptionId: string; occurredAt: Date; checkoutId?: string;
  // Provider's next billing date, when known. Access runs until then plus grace.
  periodEnd?: Date | null;
}) {
  if (!opts.chargeId || opts.chargeId.length > 200 || !Number.isFinite(opts.amount) || opts.amount <= 0 || !/^[A-Z]{3}$/.test(opts.currency)) throw new Error("Invalid verified charge data");
  if (!opts.subscriptionId || !Number.isFinite(opts.occurredAt.getTime())) throw new Error("Invalid provider event time or subscription");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"billing:" + opts.userId}, 0))`;
    const existing = await tx.$queryRaw<Array<{ paymentId: string }>>`SELECT "paymentId" FROM "SecurityPaymentCharge" WHERE "provider" = ${opts.provider} AND "chargeId" = ${opts.chargeId}`;
    if (existing.length) return { duplicate: true };
    const user = await tx.user.findUniqueOrThrow({ where: { id: opts.userId } });
    // Backstop historical rows even when the ledger was introduced later.
    const historical = await tx.payment.findFirst({ where: { method: opts.provider, txId: opts.chargeId, status: "active" }, orderBy: { createdAt: "asc" } });
    if (historical) {
      await tx.$executeRaw`INSERT INTO "SecurityPaymentCharge" ("provider", "chargeId", "paymentId", "currency") VALUES (${opts.provider}, ${opts.chargeId}, ${historical.id}, ${opts.currency})`;
      return { duplicate: true };
    }
    const providerEnd = opts.periodEnd && Number.isFinite(opts.periodEnd.getTime()) && opts.periodEnd.getTime() > Date.now() ? withGrace(opts.periodEnd) : null;
    const fallback = user.plan === opts.plan && user.planExpiresAt && user.planExpiresAt.getTime() > Date.now() + 20 * 86_400_000
      ? user.planExpiresAt : user.plan === opts.plan ? extendPlanExpiry(opts.plan, user.planExpiresAt) : withGrace(planExpiry(opts.plan)!);
    // Prefer the provider's real billing date; never shorten existing paid access.
    const expiry = providerEnd
      ? (user.plan === opts.plan && user.planExpiresAt && user.planExpiresAt > providerEnd ? user.planExpiresAt : providerEnd)
      : fallback;
    const newer = await tx.$queryRaw<Array<{ occurredAt: Date }>>`SELECT "occurredAt" FROM "SecurityUserBilling" WHERE "userId" = ${user.id}`;
    const subscriptionState = await tx.$queryRaw<Array<{ occurredAt: Date }>>`SELECT "occurredAt" FROM "SecuritySubscriptionState" WHERE "provider" = ${opts.provider} AND "subscriptionId" = ${opts.subscriptionId}`;
    if ((!newer[0] || newer[0].occurredAt <= opts.occurredAt) && (!subscriptionState[0] || subscriptionState[0].occurredAt <= opts.occurredAt)) {
      await tx.user.update({ where: { id: user.id }, data: { plan: opts.plan, planExpiresAt: expiry } });
      if (opts.subscriptionId !== ("chargeId" in opts ? opts.chargeId : undefined)) await subscriptionRecord(tx, opts, user.email, "subscription_active");
      await tx.$executeRaw`INSERT INTO "SecurityUserBilling" ("userId", "provider", "subscriptionId", "occurredAt") VALUES (${user.id}, ${opts.provider}, ${opts.subscriptionId}, ${opts.occurredAt}) ON CONFLICT ("userId") DO UPDATE SET "provider" = EXCLUDED."provider", "subscriptionId" = EXCLUDED."subscriptionId", "occurredAt" = EXCLUDED."occurredAt"`;
    }
    await tx.$executeRaw`INSERT INTO "SecuritySubscriptionState" ("provider", "subscriptionId", "userId", "occurredAt") VALUES (${opts.provider}, ${opts.subscriptionId}, ${user.id}, ${opts.occurredAt}) ON CONFLICT ("provider", "subscriptionId") DO UPDATE SET "occurredAt" = GREATEST("SecuritySubscriptionState"."occurredAt", EXCLUDED."occurredAt")`;
    // A subscription/checkout identifier is not a charge identifier; do not
    // consume an arbitrary pending checkout belonging to the same customer.
    const payment = await tx.payment.create({ data: { userId: user.id, email: user.email, plan: opts.plan, amount: opts.amount, currency: opts.currency, method: opts.provider, txId: opts.chargeId, status: "active", activatedAt: new Date() } });
    await tx.$executeRaw`INSERT INTO "SecurityPaymentCharge" ("provider", "chargeId", "paymentId", "currency") VALUES (${opts.provider}, ${opts.chargeId}, ${payment.id}, ${opts.currency})`;
    await recordCrmPayment(tx, { ...opts, paymentId: payment.id, email: user.email, name: user.name });
    if (opts.checkoutId || opts.provider === "paypal") await tx.payment.updateMany({ where: { userId: user.id, method: opts.provider, txId: opts.checkoutId || opts.subscriptionId, status: "pending" }, data: { status: "subscription_active", activatedAt: new Date() } });
    await queuePaidReceipt({ key: `${opts.provider}:${opts.chargeId}`, userId: user.id, email: user.email, name: user.name, plan: opts.plan, amount: opts.amount, currency: opts.currency, txId: opts.chargeId }, tx);
    return { duplicate: false };
  }, { timeout: 15_000 });
}

export async function applyVerifiedLifecycle(opts: {
  provider: "dodo" | "paypal"; eventId: string; subscriptionId: string; occurredAt: Date;
  userId: string; plan: string; endAccess: boolean; state?: "cancelled" | "failed" | "expired" | "paused"; periodEnd?: Date | null;
}) {
  if (!opts.eventId || !opts.subscriptionId || !Number.isFinite(opts.occurredAt.getTime())) throw new Error("Incomplete verified lifecycle event");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"billing:" + opts.userId}, 0))`;
    const seen = await tx.$queryRaw<Array<{ eventId: string }>>`SELECT "eventId" FROM "SecurityBillingEvent" WHERE "provider" = ${opts.provider} AND "eventId" = ${opts.eventId}`;
    if (seen.length) return { duplicate: true, stale: false };
    const state = await tx.$queryRaw<Array<{ occurredAt: Date }>>`SELECT "occurredAt" FROM "SecuritySubscriptionState" WHERE "provider" = ${opts.provider} AND "subscriptionId" = ${opts.subscriptionId}`;
    const active = await tx.$queryRaw<Array<{ provider: string; subscriptionId: string; occurredAt: Date }>>`SELECT "provider", "subscriptionId", "occurredAt" FROM "SecurityUserBilling" WHERE "userId" = ${opts.userId}`;
    const stale = Boolean(state[0] && state[0].occurredAt > opts.occurredAt) || Boolean(active[0] && active[0].occurredAt > opts.occurredAt);
    await tx.$executeRaw`INSERT INTO "SecurityBillingEvent" ("provider", "eventId", "occurredAt") VALUES (${opts.provider}, ${opts.eventId}, ${opts.occurredAt})`;
    if (stale) return { duplicate: false, stale: true };
    const user = await tx.user.findUniqueOrThrow({ where: { id: opts.userId } });
    if (opts.state) {
      await queueBillingNotice({ key: `${opts.provider}:${opts.eventId}`, userId: user.id, email: user.email, name: user.name, plan: opts.plan, state: opts.state, accessUntil: user.planExpiresAt }, tx);
      await subscriptionRecord(tx, opts, user.email, opts.state === "cancelled" || opts.state === "expired" ? "subscription_inactive" : "subscription_active");
      const ownsCurrentAccess = !active[0] || (active[0].provider === opts.provider && active[0].subscriptionId === opts.subscriptionId);
      if (opts.endAccess && ownsCurrentAccess) await tx.user.update({ where: { id: user.id }, data: { plan: "free", planExpiresAt: null } });
      if (ownsCurrentAccess) await tx.$executeRaw`UPDATE "SecurityUserBilling" SET "occurredAt" = GREATEST("occurredAt", ${opts.occurredAt}) WHERE "userId" = ${user.id}`;
    } else {
      const supplied = opts.periodEnd && Number.isFinite(opts.periodEnd.getTime()) ? withGrace(opts.periodEnd) : withGrace(planExpiry(opts.plan)!);
      const expiry = user.plan === opts.plan && user.planExpiresAt && supplied && user.planExpiresAt > supplied ? user.planExpiresAt : supplied;
      await tx.user.update({ where: { id: user.id }, data: { plan: opts.plan, planExpiresAt: expiry } });
      if (opts.subscriptionId !== ("chargeId" in opts ? opts.chargeId : undefined)) await subscriptionRecord(tx, opts, user.email, "subscription_active");
      await tx.$executeRaw`INSERT INTO "SecurityUserBilling" ("userId", "provider", "subscriptionId", "occurredAt") VALUES (${user.id}, ${opts.provider}, ${opts.subscriptionId}, ${opts.occurredAt}) ON CONFLICT ("userId") DO UPDATE SET "provider" = EXCLUDED."provider", "subscriptionId" = EXCLUDED."subscriptionId", "occurredAt" = EXCLUDED."occurredAt"`;
    }
    await tx.$executeRaw`INSERT INTO "SecuritySubscriptionState" ("provider", "subscriptionId", "userId", "occurredAt") VALUES (${opts.provider}, ${opts.subscriptionId}, ${user.id}, ${opts.occurredAt}) ON CONFLICT ("provider", "subscriptionId") DO UPDATE SET "occurredAt" = EXCLUDED."occurredAt"`;
    return { duplicate: false, stale: false };
  }, { timeout: 15_000 });
}

export type ReversalKind = "refund" | "chargeback" | "dispute_opened";

// Applies a verified refund, chargeback or dispute to the charge it belongs to.
// A full refund or a lost chargeback ends the paid access that charge bought,
// unless a newer verified charge already covers the user.
export async function applyVerifiedReversal(opts: {
  provider: "dodo" | "paypal"; eventId: string; chargeId: string; occurredAt: Date; kind: ReversalKind; amount?: number | null; partial?: boolean;
}) {
  if (!opts.eventId || !opts.chargeId || !Number.isFinite(opts.occurredAt.getTime())) throw new Error("Incomplete verified reversal event");
  const payment = await prisma.payment.findFirst({ where: { method: opts.provider, txId: opts.chargeId, userId: { not: null } }, orderBy: { createdAt: "asc" } });
  if (!payment?.userId) return { matched: false as const };
  const userId = payment.userId;
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"billing:" + userId}, 0))`;
    const seen = await tx.$queryRaw<Array<{ eventId: string }>>`SELECT "eventId" FROM "SecurityBillingEvent" WHERE "provider" = ${opts.provider} AND "eventId" = ${opts.eventId}`;
    if (seen.length) return { matched: true as const, duplicate: true, userId, paymentId: payment.id, status: payment.status, accessEnded: false };
    await tx.$executeRaw`INSERT INTO "SecurityBillingEvent" ("provider", "eventId", "occurredAt") VALUES (${opts.provider}, ${opts.eventId}, ${opts.occurredAt})`;
    const partial = opts.kind === "refund" && (opts.partial === true || (opts.amount != null && opts.amount < payment.amount - 0.005));
    const status = opts.kind === "dispute_opened" ? "disputed" : partial ? "partially_refunded" : opts.kind === "refund" ? "refunded" : "charged_back";
    await tx.payment.update({ where: { id: payment.id }, data: { status } });
    let accessEnded = false;
    if (status === "refunded" || status === "charged_back") {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const newer = await tx.payment.findFirst({ where: { userId, status: "active", method: { in: ["dodo", "paypal"] }, createdAt: { gt: payment.createdAt } } });
      if (!newer && user.plan === payment.plan) {
        await tx.user.update({ where: { id: userId }, data: { plan: "free", planExpiresAt: null } });
        accessEnded = true;
      }
    }
    return { matched: true as const, duplicate: false, userId, paymentId: payment.id, status, accessEnded };
  }, { timeout: 15_000 });
}
