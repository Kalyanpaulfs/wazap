// Billing state-machine integration tests - auto-pay on/off and paying twice
// (kalyan.md section 12, cases 8-10).
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayPalMock, buildDodoMock } from "./provider-mocks";

vi.mock("@/lib/paypal", () => buildPayPalMock());
vi.mock("@/lib/dodo", () => buildDodoMock());

import * as paypalMock from "@/lib/paypal";
import { chargeOnce as recordVerifiedCharge } from "./typed-calls";
import { performAutoRenewOn } from "@/lib/billing-plan-change";
import { refundPayment } from "@/lib/billing-actions";
import { prisma } from "@/lib/prisma";
import {
  assertNotDuplicate, cleanupUser, createTestUser, daysFromNow, getPlanChange, getPointer, getUser,
  paymentByTx, uid, withEnv,
} from "./helpers";
import { bootstrapLiveSubscription } from "./scenarios";
import { runPostTransactionActions } from "./wiring";

describe("Case 8: auto-pay off then on (PayPal renew)", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("performAutoRenewOn creates a pending renew while autoRenew is off, and a later SALE on S1 completes it with autoRenew true", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });

    // Simulate the auto-pay-off flow having already run (S0 cancelled at the
    // provider, autoRenew flipped to false; access keeps running to period end).
    await prisma.securityUserBilling.update({ where: { userId }, data: { autoRenew: false } });

    const user = await getUser(userId);
    const result = await performAutoRenewOn({
      user, provider: "paypal", oldSubscriptionId: S0, now: new Date(), paypalLocale: "en-US", base: "http://localhost:3000",
    });
    expect(result.status).toBe(200);
    expect(result.body.url).toBeTruthy();
    expect(paypalMock.createPayPalSubscription).toHaveBeenCalledTimes(1);

    const change = await getPlanChange(userId);
    expect(change?.kind).toBe("renew");
    expect(change?.status).toBe("pending");
    expect(change?.oldSubscriptionId).toBe(S0);
    const S1 = change!.newSubscriptionId!;
    expect(S1).toBeTruthy();
    expect(S1).not.toBe(S0);

    const pendingPayment = await paymentByTx(userId, "paypal", S1);
    expect(pendingPayment?.status).toBe("pending");

    // Later, PayPal charges the new (renewal) subscription.
    const chargeResult = await recordVerifiedCharge({
      provider: "paypal", chargeId: uid("sale"), userId, plan: "basic", amount: 9, currency: "USD",
      subscriptionId: S1, occurredAt: new Date(change!.effectiveAt!.getTime() + 1000), periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    expect(chargeResult.classification).toBe("expected_change");
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    const pointer = await getPointer(userId);
    expect(pointer?.subscriptionId).toBe(S1);
    expect(pointer?.autoRenew).toBe(true);
    const completedChange = await getPlanChange(userId);
    expect(completedChange?.status).toBe("completed");
    // A renew has no old subscription left running - nothing to cancel.
    expect(paypalMock.cancelPayPalSubscription).not.toHaveBeenCalled();
  });
});

describe("Case 9: paying twice (second live subscription)", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("(a) auto-refund on: access unchanged, S2 refunded and cancelled, no paid receipt for it", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const receiptsBefore = await prisma.outboundEmail.count({ where: { userId, type: "billing_receipt" } });

    await withEnv({ BILLING_AUTO_REFUND_DUPLICATES: "true" }, async () => {
      const S2 = uid("sub");
      const chargeResult = await recordVerifiedCharge({
        provider: "paypal", chargeId: uid("sale"), userId, plan: "basic", amount: 9, currency: "USD",
        subscriptionId: S2, occurredAt: new Date(), periodEnd: daysFromNow(30),
      });
      assertNotDuplicate(chargeResult);
      expect(chargeResult.classification).toBe("duplicate");
      expect(chargeResult.duplicateSubscription?.subscriptionId).toBe(S2);

      await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

      const pointer = await getPointer(userId);
      expect(pointer?.subscriptionId).toBe(S0); // access never moved onto S2
      const freshUser = await getUser(userId);
      expect(freshUser.plan).toBe("basic");

      expect(paypalMock.refundPayPalSale).toHaveBeenCalledTimes(1);
      expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledWith(S2, expect.any(String));

      const refundRow = await prisma.billingRefund.findUnique({ where: { paymentId: chargeResult.duplicateSubscription!.paymentId! } });
      expect(refundRow?.status).toBe("succeeded");
      expect(refundRow?.kind).toBe("duplicate");

      const receiptsAfter = await prisma.outboundEmail.count({ where: { userId, type: "billing_receipt" } });
      expect(receiptsAfter).toBe(receiptsBefore); // no paid receipt queued for the refunded duplicate
    });
  });

  it("(b) auto-refund off: flags a second_live_subscription BillingAttention row", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });

    const S2 = uid("sub");
    const chargeId = uid("sale");
    const chargeResult = await recordVerifiedCharge({
      provider: "paypal", chargeId, userId, plan: "basic", amount: 9, currency: "USD",
      subscriptionId: S2, occurredAt: new Date(), periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    expect(chargeResult.classification).toBe("duplicate");
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    const attention = await prisma.billingAttention.findUnique({ where: { provider_eventId: { provider: "paypal", eventId: `dup:paypal:${chargeId}` } } });
    expect(attention?.eventType).toBe("second_live_subscription");
    expect(attention?.userId).toBe(userId);
  });
});

describe("Case 10: retried duplicate webhook after a crash", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("hands the refund back on retry, then stops once the refund has actually run", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });

    await withEnv({ BILLING_AUTO_REFUND_DUPLICATES: "true" }, async () => {
      const S2 = uid("sub");
      const chargeId = uid("sale"); // fixed - simulates the provider retrying the same webhook

      const first = await recordVerifiedCharge({
        provider: "paypal", chargeId, userId, plan: "basic", amount: 9, currency: "USD",
        subscriptionId: S2, occurredAt: new Date(), periodEnd: daysFromNow(30),
      });
      assertNotDuplicate(first);
      expect(first.duplicateSubscription?.subscriptionId).toBe(S2);
      // Simulate the crash: do NOT run runPostTransactionActions yet.

      const second = await recordVerifiedCharge({
        provider: "paypal", chargeId, userId, plan: "basic", amount: 9, currency: "USD",
        subscriptionId: S2, occurredAt: new Date(), periodEnd: daysFromNow(30),
      });
      expect(second.duplicate).toBe(true);
      expect(second.duplicateSubscription?.subscriptionId).toBe(S2);
      expect(second.duplicateSubscription?.paymentId).toBe(first.duplicateSubscription?.paymentId);

      // Now the refund actually runs.
      await runPostTransactionActions({ cancelOld: null, duplicateSubscription: second.duplicateSubscription, userId });
      const refundRow = await prisma.billingRefund.findUnique({ where: { paymentId: first.duplicateSubscription!.paymentId! } });
      expect(refundRow?.status).toBe("succeeded");

      const third = await recordVerifiedCharge({
        provider: "paypal", chargeId, userId, plan: "basic", amount: 9, currency: "USD",
        subscriptionId: S2, occurredAt: new Date(), periodEnd: daysFromNow(30),
      });
      expect(third.duplicate).toBe(true);
      expect(third.duplicateSubscription).toBeUndefined();
    });
  });
});
