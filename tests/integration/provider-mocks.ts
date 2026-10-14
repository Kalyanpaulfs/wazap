// Builds the mock module objects used by each integration test file's
// vi.mock("@/lib/paypal", ...) / vi.mock("@/lib/dodo", ...) factory. Network
// calls are fully replaced; planForDodoProduct/dodoProductForPlan and the
// PayPal plan-id <-> plan lookups are kept as simple pure re-implementations
// (same logic, no env/network) so the rest of the billing code - which reads
// plans back out of a "subscription" - keeps working.
import { vi } from "vitest";

const PAYPAL_PLAN_IDS: Record<string, string> = {
  basic: "P-LOCAL-QA-BASIC",
  pro: "P-LOCAL-QA-PRO",
  ultimate: "P-LOCAL-QA-ULTIMATE",
};
const PAYPAL_PLAN_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PAYPAL_PLAN_IDS).map(([plan, id]) => [id, plan]),
);

export function buildPayPalMock() {
  return {
    getPayPalEnvironment: () => "sandbox" as const,
    getPayPalApiBase: () => "https://api-m.sandbox.paypal.com",
    getPayPalPlanId: (plan: string) => PAYPAL_PLAN_IDS[plan.toLowerCase()],
    getPlanFromPayPalPlanId: (planId?: string | null) => (planId ? PAYPAL_PLAN_BY_ID[planId] ?? null : null),
    assertPayPalConfigured: () => ({ clientId: "test-client-id", clientSecret: "test-client-secret" }),
    getPayPalAccessToken: vi.fn(async () => "test-access-token"),
    paypalRequest: vi.fn(async () => ({})),
    getPayPalSubscription: vi.fn(async (id: string) => ({ id, status: "ACTIVE" })),
    cancelPayPalSubscription: vi.fn(async (_id: string, _reason: string) => undefined),
    createPayPalSubscription: vi.fn(async (_opts: Record<string, unknown>) => ({
      id: `S-${Math.random().toString(36).slice(2, 10)}`,
      approvalUrl: "https://paypal.test/approve",
    })),
    refundPayPalSale: vi.fn(async (_saleId: string, _opts: Record<string, unknown>) => ({
      id: `RF-${Math.random().toString(36).slice(2, 10)}`,
      state: "completed",
    })),
  };
}

const DODO_PRODUCT_IDS: Record<string, string> = {
  basic: "prod_local_qa_basic",
  pro: "prod_local_qa_pro",
  ultimate: "prod_local_qa_ultimate",
};
const DODO_PLAN_BY_PRODUCT: Record<string, string> = Object.fromEntries(
  Object.entries(DODO_PRODUCT_IDS).map(([plan, id]) => [id, plan]),
);

export function buildDodoMock() {
  return {
    dodoProductForPlan: (plan: string) => DODO_PRODUCT_IDS[plan.toLowerCase()],
    planForDodoProduct: (productId?: string | null) => (productId ? DODO_PLAN_BY_PRODUCT[productId] ?? null : null),
    getDodoClient: vi.fn(async () => { throw new Error("getDodoClient should not be called directly in tests - mock the higher-level helper instead."); }),
    changeDodoPlan: vi.fn(async (_subscriptionId: string, _plan: string, _mode: "upgrade" | "downgrade") => ({ id: "dodo-change" })),
    getDodoSubscription: vi.fn(async (subscriptionId: string) => ({
      id: subscriptionId,
      status: "active",
      product_id: DODO_PRODUCT_IDS.basic,
      next_billing_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })),
    setDodoAutoRenew: vi.fn(async (_subscriptionId: string, _on: boolean) => ({ ok: true })),
    cancelDodoSubscriptionNow: vi.fn(async (_subscriptionId: string) => ({ status: "cancelled" })),
    refundDodoPayment: vi.fn(async (_paymentId: string, _reason?: string) => ({ id: `dodo-refund-${Math.random().toString(36).slice(2, 10)}` })),
    createDodoPortalLink: vi.fn(async () => "https://dodo.test/portal"),
    updateDodoPaymentMethod: vi.fn(async () => null),
  };
}
