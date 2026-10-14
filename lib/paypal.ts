import { PLAN_PRICES } from "./billing";

export type PayPalEnvironment = "live" | "sandbox";

const PAYPAL_API_BASE: Record<PayPalEnvironment, string> = {
  live: "https://api-m.paypal.com",
  sandbox: "https://api-m.sandbox.paypal.com",
};

export function getPayPalEnvironment(): PayPalEnvironment {
  return process.env.PAYPAL_ENVIRONMENT === "sandbox" ? "sandbox" : "live";
}

export function getPayPalApiBase() {
  return PAYPAL_API_BASE[getPayPalEnvironment()];
}

export function getPayPalPlanId(plan: string) {
  return {
    basic: process.env.PAYPAL_PLAN_ID_BASIC,
    pro: process.env.PAYPAL_PLAN_ID_PRO,
    ultimate: process.env.PAYPAL_PLAN_ID_ULTIMATE,
    business: process.env.PAYPAL_PLAN_ID_BUSINESS,
  }[plan.toLowerCase()];
}

export function getPlanFromPayPalPlanId(planId?: string | null) {
  if (!planId) return null;
  const planIds = {
    basic: [process.env.PAYPAL_PLAN_ID_BASIC, ...(process.env.PAYPAL_LEGACY_PLAN_IDS_BASIC || "").split(",")],
    pro: [process.env.PAYPAL_PLAN_ID_PRO, ...(process.env.PAYPAL_LEGACY_PLAN_IDS_PRO || "").split(",")],
    ultimate: [process.env.PAYPAL_PLAN_ID_ULTIMATE, ...(process.env.PAYPAL_LEGACY_PLAN_IDS_ULTIMATE || "").split(",")],
    business: [process.env.PAYPAL_PLAN_ID_BUSINESS, ...(process.env.PAYPAL_LEGACY_PLAN_IDS_BUSINESS || "").split(",")],
  };
  const match = Object.entries(planIds).find(([, values]) => values.map(value => value?.trim()).includes(planId));
  return match?.[0] ?? null;
}

export function assertPayPalConfigured() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal API credentials are not configured.");
  }
  return { clientId, clientSecret };
}

export async function getPayPalAccessToken() {
  const { clientId, clientSecret } = assertPayPalConfigured();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal token request failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("PayPal token response did not include an access token.");
  return data.access_token;
}

export async function paypalRequest<T>(path: string, init: RequestInit = {}) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${getPayPalApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`PayPal API request failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return data as T;
}

export type PayPalSubscriptionResponse = {
  id?: string;
  status?: string;
  links?: Array<{ href: string; rel: string; method?: string }>;
  // Present on a GET of a live subscription; used to schedule a downgrade's
  // effectiveAt and an auto-pay-on renewal's startTime (spec 12f).
  billing_info?: { next_billing_time?: string };
};

export function getPayPalSubscription(id: string) {
  return paypalRequest<PayPalSubscriptionResponse>(`/v1/billing/subscriptions/${encodeURIComponent(id)}`);
}

export function cancelPayPalSubscription(id: string, reason: string) {
  return paypalRequest<void>(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason.slice(0, 128) }),
  });
}

export async function createPayPalSubscription(opts: {
  planId: string; userId: string; email: string; name?: string | null; locale: string;
  returnUrl: string; cancelUrl: string; startTime?: Date;
}) {
  const subscription = await paypalRequest<PayPalSubscriptionResponse>("/v1/billing/subscriptions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      plan_id: opts.planId,
      custom_id: opts.userId,
      quantity: "1",
      ...(opts.startTime ? { start_time: opts.startTime.toISOString() } : {}),
      subscriber: {
        email_address: opts.email,
        name: opts.name ? { given_name: opts.name.slice(0, 140) } : undefined,
      },
      application_context: {
        brand_name: "Wazap",
        locale: opts.locale,
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    }),
  });
  const approvalUrl = subscription.links?.find(link => link.rel === "approve")?.href;
  return { id: subscription.id, approvalUrl };
}

export function refundPayPalSale(saleId: string, opts: { amount?: number; currency?: string; note?: string }) {
  const body: Record<string, unknown> = {};
  if (opts.note) body.note_to_payer = opts.note.slice(0, 255);
  if (opts.amount != null && opts.currency) body.amount = { total: opts.amount.toFixed(2), currency: opts.currency };
  return paypalRequest<{ id?: string; state?: string }>(`/v1/payments/sale/${encodeURIComponent(saleId)}/refund`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
