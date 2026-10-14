// Billing state-machine integration tests - refunds and a stale pending plan
// change (kalyan.md section 12, cases 11-15).
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayPalMock, buildDodoMock } from "./provider-mocks";

vi.mock("@/lib/paypal", () => buildPayPalMock());
vi.mock("@/lib/dodo", () => buildDodoMock());

import * as paypalMock from "@/lib/paypal";
import { applyVerifiedReversal } from "@/lib/payment-integrity";
import { refundPayment, reconcilePendingPlanChange } from "@/lib/billing-actions";
import { prisma } from "@/lib/prisma";
import { cleanupUser, createTestUser, daysFromNow, getPlanChange, getUser, paymentByTx, uid } from "./helpers";
import { bootstrapLiveSubscription, createPendingChange } from "./scenarios";

describe("Case 11: admin refund within 48h, re-refund, and after the window", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("refunds, ends access, cancels the subscription, and logs an audit row", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { subscriptionId: S0, chargeId } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const payment = await paymentByTx(userId, "paypal", chargeId);
    expect(payment).not.toBeNull();

    const result = await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "customer request", now: new Date() });
    expect(result).toMatchObject({ ok: true, accessEnded: true, cancelled: true });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("free");
    expect(freshUser.planExpiresAt).toBeNull();

    const refundRow = await prisma.billingRefund.findUnique({ where: { paymentId: payment!.id } });
    expect(refundRow?.status).toBe("succeeded");

    const auditRow = await prisma.billingAuditLog.findFirst({ where: { userId, action: "refund" } });
    expect(auditRow).not.toBeNull();

    expect(paypalMock.refundPayPalSale).toHaveBeenCalledWith(chargeId, expect.any(Object));
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledWith(S0, expect.any(String));
  });

  it("a second refund attempt on the same payment is rejected", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { chargeId } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const payment = await paymentByTx(userId, "paypal", chargeId);

    const first = await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "r1", now: new Date() });
    expect(first.ok).toBe(true);

    const second = await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "r2", now: new Date() });
    expect(second.ok).toBe(false);
    // Only one BillingRefund row ever exists for this payment either way.
    const refundCount = await prisma.billingRefund.count({ where: { paymentId: payment!.id } });
    expect(refundCount).toBe(1);
    expect(paypalMock.refundPayPalSale).toHaveBeenCalledTimes(1); // never charged the provider twice
  });

  // BUG (see report): canRefund (lib/billing-rules.ts:44-45) checks
  // `status !== "active"` before `alreadyRefunded`. applyLocalRefund always
  // flips the payment to status "refunded" *before* refundPayment returns
  // (lib/billing-actions.ts:98, called at line 240), so by the time a normal,
  // sequential second refund request runs, canRefund hits the "not_active"
  // branch first and refundPayment (lib/billing-actions.ts:152-154) returns
  // {ok:false, reason:"not_active"} - the explicit "already_refunded" returns
  // at lib/billing-actions.ts:160/167/178 are dead code on this path. The
  // admin refund route (app/api/admin/billing/refund/route.ts:30) only maps
  // "already_refunded"/"window_closed" to 409; everything else (including
  // "not_active") falls through to a 502, so a double-click on "Refund"
  // looks like a transient provider failure instead of "already refunded".
  it("a second refund attempt reports already_refunded, not a generic not_active", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { chargeId } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const payment = await paymentByTx(userId, "paypal", chargeId);

    await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "r1", now: new Date() });
    const second = await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "r2", now: new Date() });
    expect(second).toEqual({ ok: false, reason: "already_refunded" });
  });

  it("refuses a refund once the 48h window has closed", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { chargeId } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const payment = await paymentByTx(userId, "paypal", chargeId);
    await prisma.payment.update({ where: { id: payment!.id }, data: { createdAt: new Date(Date.now() - 49 * 3_600_000) } });

    const result = await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "late", now: new Date() });
    expect(result).toEqual({ ok: false, reason: "window_closed" });
    expect(paypalMock.refundPayPalSale).not.toHaveBeenCalled();
    const refundRow = await prisma.billingRefund.findUnique({ where: { paymentId: payment!.id } });
    expect(refundRow).toBeNull();
  });
});

describe("Case 12: refund of a legacy payment (no 'charge' audit row)", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("falls back to the pointer subscription to cancel", async () => {
    const user = await createTestUser({ plan: "basic", planExpiresAt: daysFromNow(10) });
    userId = user.id; email = user.email;
    const chargeId = uid("legacy-sale");
    const payment = await prisma.payment.create({
      data: { userId, email, plan: "basic", amount: 9, currency: "USD", method: "paypal", txId: chargeId, status: "active", createdAt: new Date() },
    });
    const S_legacy = uid("sub");
    await prisma.securityUserBilling.create({ data: { userId, provider: "paypal", subscriptionId: S_legacy, occurredAt: new Date() } });

    const result = await refundPayment({ paymentId: payment.id, kind: "admin", actorUserId: "admin-1", reason: "legacy", now: new Date() });
    expect(result.ok).toBe(true);
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledWith(S_legacy, expect.any(String));
  });
});

describe("Case 13: refund when the user's plan no longer matches the payment's plan", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("leaves access untouched", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { chargeId } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const payment = await paymentByTx(userId, "paypal", chargeId);
    // An admin moved the user to "pro" independently of this payment.
    await prisma.user.update({ where: { id: userId }, data: { plan: "pro" } });

    const result = await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "plan moved", now: new Date() });
    expect(result).toMatchObject({ ok: true, accessEnded: false });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("pro"); // untouched by the refund
  });
});

describe("Case 14: provider refund webhook after our own admin refund is idempotent", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("has no further effect once we already refunded it ourselves", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { chargeId } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const payment = await paymentByTx(userId, "paypal", chargeId);
    await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "pre-emptive", now: new Date() });

    const freshUserBeforeWebhook = await getUser(userId);
    expect(freshUserBeforeWebhook.plan).toBe("free");

    const reversal = await applyVerifiedReversal({
      provider: "paypal", eventId: uid("evt"), chargeId: chargeId!, occurredAt: new Date(), kind: "refund", amount: 9,
    });
    expect(reversal.matched).toBe(true);
    if (reversal.matched) {
      expect(reversal.accessEnded).toBe(false); // already applied - no double effect
      expect(reversal.status).toBe("refunded");
    }

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("free");
    const refundCount = await prisma.billingRefund.count({ where: { paymentId: payment!.id } });
    expect(refundCount).toBe(1); // the webhook reversal never touches BillingRefund
  });
});

describe("Case 15: stale pending PayPal plan change", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("is cancelled by reconcilePendingPlanChange, which also cancels its unapproved new subscription", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const S1 = uid("sub");
    await createPendingChange({
      userId, kind: "upgrade", fromPlan: "basic", toPlan: "pro", provider: "paypal",
      oldSubscriptionId: S0, newSubscriptionId: S1, createdAt: new Date(Date.now() - 2 * 3_600_000),
    });

    const result = await reconcilePendingPlanChange(userId, new Date());
    expect(result.ok).toBe(true);

    const change = await getPlanChange(userId);
    expect(change?.status).toBe("cancelled");
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledWith(S1, expect.any(String));
  });
});

describe("Case 17: refund also cancels a scheduled renewal/downgrade subscription", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("cancels the pending change's new subscription so it never bills later", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { subscriptionId: S0, chargeId } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "pro", amount: 19 });
    const S1 = uid("sub");
    await createPendingChange({ userId, kind: "renew", fromPlan: "pro", toPlan: "pro", provider: "paypal", oldSubscriptionId: S0, newSubscriptionId: S1, effectiveAt: daysFromNow(30) });
    await prisma.payment.create({ data: { userId, email, plan: "pro", amount: 19, method: "paypal", txId: S1, status: "subscription_active" } });
    const payment = await paymentByTx(userId, "paypal", chargeId);

    const result = await refundPayment({ paymentId: payment!.id, kind: "admin", actorUserId: "admin-1", reason: "r", now: new Date() });
    expect(result).toMatchObject({ ok: true, accessEnded: true });
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledWith(S1, expect.any(String));
    expect((await getPlanChange(userId))?.status).toBe("cancelled");
  });
});
