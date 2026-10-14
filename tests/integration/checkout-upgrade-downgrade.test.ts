// Billing state-machine integration tests - checkout, renewal, upgrade and
// downgrade (kalyan.md section 12, cases 1-7). Runs against the real local
// Postgres (wazap_dev); @/lib/paypal and @/lib/dodo are mocked so no network
// call ever happens.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayPalMock, buildDodoMock } from "./provider-mocks";

// The factory must not close over an outer `const` (vi.mock is hoisted above
// it, which would throw "Cannot access before initialization"); it calls the
// builder itself, and the mocked module's own exports (imported as a
// namespace below) are the handle tests use for assertions.
vi.mock("@/lib/paypal", () => buildPayPalMock());
vi.mock("@/lib/dodo", () => buildDodoMock());

import * as paypalMock from "@/lib/paypal";
import * as dodoMock from "@/lib/dodo";
import { chargeOnce as recordVerifiedCharge, lifecycleOnce as applyVerifiedLifecycle } from "./typed-calls";
import { assertLifecycleApplied, assertNotDuplicate, cleanupUser, createTestUser, daysFromNow, getPlanChange, getPointer, getUser, uid } from "./helpers";
import { bootstrapLiveSubscription, createPendingChange } from "./scenarios";
import { cancelOldForScheduledActivation, runPostTransactionActions } from "./wiring";

describe("Case 1: new PayPal checkout (ACTIVATED then SALE.COMPLETED)", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("grants the plan and sets the pointer once the sale completes", async () => {
    const user = await createTestUser({ plan: "free" });
    userId = user.id; email = user.email;
    const S0 = uid("sub");
    const t0 = new Date();

    const activated = await applyVerifiedLifecycle({
      provider: "paypal", eventId: uid("evt"), subscriptionId: S0, occurredAt: t0,
      userId, plan: "basic", endAccess: false,
    });
    assertLifecycleApplied(activated);

    const chargeResult = await recordVerifiedCharge({
      provider: "paypal", chargeId: uid("sale"), userId, plan: "basic",
      amount: 9, currency: "USD", subscriptionId: S0, occurredAt: new Date(t0.getTime() + 1000),
      periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("basic");
    expect(freshUser.planExpiresAt).not.toBeNull();
    expect(freshUser.planExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 25 * 86_400_000);

    const pointer = await getPointer(userId);
    expect(pointer?.provider).toBe("paypal");
    expect(pointer?.subscriptionId).toBe(S0);
    expect(pointer?.autoRenew).toBe(true);

    expect(paypalMock.cancelPayPalSubscription).not.toHaveBeenCalled();
  });
});

describe("Case 2: normal monthly renewal (same subscription)", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("extends expiry without touching the subscription", async () => {
    const user = await createTestUser({ plan: "free" });
    userId = user.id; email = user.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });

    const before = await getUser(userId);
    const expiryBefore = before.planExpiresAt!.getTime();

    const renewalOccurredAt = new Date(expiryBefore - 2 * 86_400_000); // renews just before the old expiry
    const chargeResult = await recordVerifiedCharge({
      provider: "paypal", chargeId: uid("sale"), userId, plan: "basic", amount: 9, currency: "USD",
      subscriptionId: S0, occurredAt: renewalOccurredAt, periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    const after = await getUser(userId);
    expect(after.plan).toBe("basic");
    expect(after.planExpiresAt!.getTime()).toBeGreaterThan(expiryBefore);

    const pointer = await getPointer(userId);
    expect(pointer?.subscriptionId).toBe(S0);
    expect(paypalMock.cancelPayPalSubscription).not.toHaveBeenCalled();
    expect(dodoMock.cancelDodoSubscriptionNow).not.toHaveBeenCalled();
  });
});

describe("Case 3/4: PayPal upgrade basic -> pro", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("order A: ACTIVATED(S1) before SALE(S1) - completes and cancels S0 exactly once", async () => {
    const user = await createTestUser({ plan: "free" });
    userId = user.id; email = user.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const S1 = uid("sub");
    await createPendingChange({ userId, kind: "upgrade", fromPlan: "basic", toPlan: "pro", provider: "paypal", oldSubscriptionId: S0, newSubscriptionId: S1 });

    const tActivate = new Date();
    const activated = await applyVerifiedLifecycle({
      provider: "paypal", eventId: uid("evt"), subscriptionId: S1, occurredAt: tActivate, userId, plan: "pro", endAccess: false,
    });
    assertLifecycleApplied(activated);

    const chargeResult = await recordVerifiedCharge({
      provider: "paypal", chargeId: uid("sale"), userId, plan: "pro", amount: 19, currency: "USD",
      subscriptionId: S1, occurredAt: new Date(tActivate.getTime() + 1000), periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("pro");
    const pointer = await getPointer(userId);
    expect(pointer?.subscriptionId).toBe(S1);
    const change = await getPlanChange(userId);
    expect(change?.status).toBe("completed");
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledTimes(1);
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledWith(S0, expect.any(String));
  });

  it("order B: SALE(S1) before ACTIVATED(S1) - same end state, S0 cancelled exactly once", async () => {
    const user = await createTestUser({ plan: "free" });
    userId = user.id; email = user.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "basic", amount: 9 });
    const S1 = uid("sub");
    await createPendingChange({ userId, kind: "upgrade", fromPlan: "basic", toPlan: "pro", provider: "paypal", oldSubscriptionId: S0, newSubscriptionId: S1 });

    const tSale = new Date();
    const chargeResult = await recordVerifiedCharge({
      provider: "paypal", chargeId: uid("sale"), userId, plan: "pro", amount: 19, currency: "USD",
      subscriptionId: S1, occurredAt: tSale, periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    const activated = await applyVerifiedLifecycle({
      provider: "paypal", eventId: uid("evt"), subscriptionId: S1, occurredAt: new Date(tSale.getTime() + 1000), userId, plan: "pro", endAccess: false,
    });
    assertLifecycleApplied(activated);
    await runPostTransactionActions({ cancelOld: null, duplicateSubscription: activated.duplicateSubscription, userId });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("pro");
    const pointer = await getPointer(userId);
    expect(pointer?.subscriptionId).toBe(S1);
    const change = await getPlanChange(userId);
    expect(change?.status).toBe("completed");
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledTimes(1);
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledWith(S0, expect.any(String));
  });
});

describe("Case 5: PayPal scheduled downgrade pro -> basic", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("runs the full scheduled-downgrade lifecycle without an early plan drop and without re-disabling autoRenew", async () => {
    const user = await createTestUser({ plan: "free" });
    userId = user.id; email = user.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "pro", amount: 19 });
    const S1 = uid("sub");
    const effectiveAt = daysFromNow(27); // ~ the bootstrap's periodEnd (30d) minus a little
    await createPendingChange({ userId, kind: "downgrade", fromPlan: "pro", toPlan: "basic", provider: "paypal", oldSubscriptionId: S0, newSubscriptionId: S1, effectiveAt });

    // Step 1: the buyer approves the future-dated new subscription.
    const tActivate = new Date();
    const activated = await applyVerifiedLifecycle({
      provider: "paypal", eventId: uid("evt"), subscriptionId: S1, occurredAt: tActivate, userId, plan: "basic", endAccess: false,
    });
    assertLifecycleApplied(activated);
    expect(activated.scheduledActivated?.kind).toBe("downgrade");
    const cancelOld = cancelOldForScheduledActivation(activated.scheduledActivated);
    expect(cancelOld?.subscriptionId).toBe(S0);
    await runPostTransactionActions({ cancelOld, duplicateSubscription: activated.duplicateSubscription, userId });

    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledTimes(1);
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledWith(S0, expect.any(String));
    let freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("pro"); // unchanged until S1 actually charges

    // Step 2: PayPal echoes back the cancellation of S0 as a CANCELLED event.
    const cancelled = await applyVerifiedLifecycle({
      provider: "paypal", eventId: uid("evt"), subscriptionId: S0, occurredAt: new Date(tActivate.getTime() + 1000),
      userId, plan: "pro", endAccess: false, state: "cancelled",
    });
    assertLifecycleApplied(cancelled);
    const pointerAfterCancel = await getPointer(userId);
    expect(pointerAfterCancel?.autoRenew).toBe(true); // must NOT be turned off - S1 takes over billing

    // Step 3: at period end, S1's first charge actually switches the plan.
    const chargeResult = await recordVerifiedCharge({
      provider: "paypal", chargeId: uid("sale"), userId, plan: "basic", amount: 9, currency: "USD",
      subscriptionId: S1, occurredAt: new Date(effectiveAt.getTime() + 1000), periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("basic");
    const change = await getPlanChange(userId);
    expect(change?.status).toBe("completed");
    const pointer = await getPointer(userId);
    expect(pointer?.subscriptionId).toBe(S1);
    // No *extra* cancel beyond the one from step 1.
    expect(paypalMock.cancelPayPalSubscription).toHaveBeenCalledTimes(1);
  });
});

describe("Case 6: Dodo upgrade in place (same subscription id)", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("completes the pending change without cancelling anything", async () => {
    const user = await createTestUser({ plan: "free" });
    userId = user.id; email = user.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "dodo", userId, plan: "basic", amount: 9 });
    await createPendingChange({ userId, kind: "upgrade", fromPlan: "basic", toPlan: "pro", provider: "dodo", oldSubscriptionId: S0, newSubscriptionId: S0 });

    const chargeResult = await recordVerifiedCharge({
      provider: "dodo", chargeId: uid("pay"), userId, plan: "pro", amount: 19, currency: "USD",
      subscriptionId: S0, occurredAt: new Date(), periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("pro");
    const change = await getPlanChange(userId);
    expect(change?.status).toBe("completed");
    const pointer = await getPointer(userId);
    expect(pointer?.subscriptionId).toBe(S0);
    expect(dodoMock.cancelDodoSubscriptionNow).not.toHaveBeenCalled();
    expect(paypalMock.cancelPayPalSubscription).not.toHaveBeenCalled();
  });
});

describe("Case 7: Dodo renewal charge that doesn't match a pending downgrade yet", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("stays pending and is classified as a normal renewal of the current subscription", async () => {
    const user = await createTestUser({ plan: "free" });
    userId = user.id; email = user.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "dodo", userId, plan: "pro", amount: 19 });
    // A scheduled downgrade pro -> basic is pending, in place (same subscription id), not due yet.
    await createPendingChange({ userId, kind: "downgrade", fromPlan: "pro", toPlan: "basic", provider: "dodo", oldSubscriptionId: S0, newSubscriptionId: S0, effectiveAt: daysFromNow(20) });

    // A normal renewal charge arrives while the product is still "pro".
    const chargeResult = await recordVerifiedCharge({
      provider: "dodo", chargeId: uid("pay"), userId, plan: "pro", amount: 19, currency: "USD",
      subscriptionId: S0, occurredAt: new Date(), periodEnd: daysFromNow(30),
    });
    assertNotDuplicate(chargeResult);
    expect(chargeResult.classification).toBe("same");
    await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("pro");
    const change = await getPlanChange(userId);
    expect(change?.status).toBe("pending"); // untouched - the downgrade hasn't happened yet
    expect(dodoMock.cancelDodoSubscriptionNow).not.toHaveBeenCalled();
  });
});
