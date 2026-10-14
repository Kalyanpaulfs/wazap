export type DodoEnvironment = "test_mode" | "live_mode";

const PRODUCT_BY_PLAN: Record<string, string | undefined> = {
  basic: process.env.DODO_PRODUCT_ID_BASIC,
  pro: process.env.DODO_PRODUCT_ID_PRO,
  ultimate: process.env.DODO_PRODUCT_ID_ULTIMATE,
  business: process.env.DODO_PRODUCT_ID_BUSINESS,
};

export function dodoProductForPlan(plan: string) {
  return PRODUCT_BY_PLAN[plan.toLowerCase()];
}

export function planForDodoProduct(productId?: string | null) {
  if (!productId) return null;
  const match = Object.entries(PRODUCT_BY_PLAN).find(([, id]) => id === productId);
  return match?.[0] ?? null;
}

// Same env logic as the dodo/create route: test_mode is only allowed outside
// production, so a stray env var can never put live traffic in test mode.
export async function getDodoClient() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) throw new Error("Dodo payments are not configured.");
  const requested = (process.env.DODO_ENVIRONMENT as DodoEnvironment) || "test_mode";
  const environment: DodoEnvironment = requested === "test_mode" && process.env.NODE_ENV === "production" ? "live_mode" : requested;
  const { default: DodoPayments } = await import("dodopayments");
  return new DodoPayments({ bearerToken: apiKey, environment });
}

// Upgrade bills the new price today (effective_at immediately). Downgrade is
// scheduled for the next billing date and must not charge now. Dodo only
// accepts full_immediately with next_billing_date (do_not_bill is rejected
// with 422); the new price is billed on that date, not today.
export async function changeDodoPlan(subscriptionId: string, plan: string, mode: "upgrade" | "downgrade") {
  const productId = dodoProductForPlan(plan);
  if (!productId) throw new Error(`No Dodo product configured for plan ${plan}`);
  const client = await getDodoClient();
  return client.subscriptions.changePlan(subscriptionId, {
    product_id: productId,
    quantity: 1,
    proration_billing_mode: "full_immediately",
    effective_at: mode === "upgrade" ? "immediately" : "next_billing_date",
  });
}

// Spec 12f (step 3/4): downgrade needs the subscription's real next billing
// date, auto-pay-on needs to know the subscription hasn't already ended, and
// the portal link needs the Dodo customer id - all come from the same read.
export async function getDodoSubscription(subscriptionId: string) {
  const client = await getDodoClient();
  return client.subscriptions.retrieve(subscriptionId);
}

export async function setDodoAutoRenew(subscriptionId: string, on: boolean) {
  const client = await getDodoClient();
  return client.subscriptions.update(subscriptionId, { cancel_at_next_billing_date: !on });
}

export async function cancelDodoSubscriptionNow(subscriptionId: string) {
  const client = await getDodoClient();
  return client.subscriptions.update(subscriptionId, { status: "cancelled" });
}

export async function refundDodoPayment(paymentId: string, reason?: string) {
  const client = await getDodoClient();
  return client.refunds.create({ payment_id: paymentId, reason });
}

export async function createDodoPortalLink(customerId: string, returnUrl?: string) {
  const client = await getDodoClient();
  const session = await client.customers.customerPortal.create(customerId, returnUrl ? { return_url: returnUrl } : undefined);
  return session.link;
}

// Card update without the customer portal (the portal could allow plan changes).
export async function updateDodoPaymentMethod(subscriptionId: string, returnUrl?: string) {
  const client = await getDodoClient();
  const res = await client.subscriptions.updatePaymentMethod(subscriptionId, { payment_method: { type: "new", ...(returnUrl ? { return_url: returnUrl } : {}) } });
  return res.payment_link || null;
}

// Drops a scheduled (next-billing-date) plan change; the subscription keeps
// its current product.
export async function cancelDodoScheduledChange(subscriptionId: string) {
  const client = await getDodoClient();
  return client.subscriptions.cancelChangePlan(subscriptionId);
}
