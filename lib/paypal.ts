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
