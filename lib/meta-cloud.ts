import { createHmac, timingSafeEqual } from "crypto";
import { decryptSecret, encryptSecret } from "@/lib/developer-platform";

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "";

export function metaProviderReadiness() {
  const required = ["META_APP_ID", "META_APP_SECRET", "META_CONFIG_ID", "META_VERIFY_TOKEN", "META_GRAPH_VERSION"] as const;
  const missing = required.filter((key) => !process.env[key]);
  return {
    configured: missing.length === 0,
    missing,
    appId: process.env.META_APP_ID || null,
    configId: process.env.META_CONFIG_ID || null,
    graphVersion: META_GRAPH_VERSION || null,
    billing: "Meta bills each customer directly; Wazap adds no messaging-fee markup.",
  };
}

export function verifyMetaSignature(rawBody: string, supplied: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !supplied?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const actualHex = supplied.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(actualHex)) return false;
  const actual = Buffer.from(actualHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function graph(path: string, token: string, init?: RequestInit) {
  if (!META_GRAPH_VERSION) throw new Error("META_GRAPH_VERSION is not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    cache: "no-store",
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error?.message || `Meta Graph API returned ${response.status}`).slice(0, 500));
  return data;
}

export async function discoverMetaAssets(token: string) {
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Meta app credentials are not configured.");
  const debug = await graph(`debug_token?input_token=${encodeURIComponent(token)}`, `${appId}|${appSecret}`);
  const scopes = Array.isArray(debug?.data?.granular_scopes) ? debug.data.granular_scopes : [];
  const targetIds = Array.from(new Set<string>(scopes
    .filter((item: { scope?: string }) => String(item?.scope || "").startsWith("whatsapp_business_"))
    .flatMap((item: { target_ids?: unknown[] }) => Array.isArray(item?.target_ids) ? item.target_ids.map(String) : [])));
  const accounts: Array<{ waba: Record<string, unknown>; phones: Array<Record<string, unknown>> }> = [];
  for (const id of targetIds.slice(0, 25)) {
    try {
      const waba = await graph(`${encodeURIComponent(id)}?fields=id,name,currency,timezone_id`, token);
      const result = await graph(`${encodeURIComponent(id)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type&limit=100`, token);
      const phones = Array.isArray(result?.data) ? result.data : [];
      if (phones.length) accounts.push({ waba, phones });
    } catch { /* Ignore non-WABA granular targets. */ }
  }
  if (!accounts.length) {
    try {
      const businesses = await graph("me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name},client_whatsapp_business_accounts{id,name}&limit=100", token);
      const wabaIds = Array.from(new Set<string>((Array.isArray(businesses?.data) ? businesses.data : []).flatMap((business: Record<string, any>) => [
        ...(Array.isArray(business?.owned_whatsapp_business_accounts?.data) ? business.owned_whatsapp_business_accounts.data : []),
        ...(Array.isArray(business?.client_whatsapp_business_accounts?.data) ? business.client_whatsapp_business_accounts.data : []),
      ]).map((item: Record<string, unknown>) => String(item.id || "")).filter(Boolean)));
      for (const id of wabaIds.slice(0, 25)) {
        try {
          const waba = await graph(`${encodeURIComponent(id)}?fields=id,name,currency,timezone_id`, token);
          const result = await graph(`${encodeURIComponent(id)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type&limit=100`, token);
          const phones = Array.isArray(result?.data) ? result.data : [];
          if (phones.length) accounts.push({ waba, phones });
        } catch { /* Continue through accessible accounts. */ }
      }
    } catch { /* The granted configuration may not include business_management. */ }
  }
  return accounts;
}

export async function exchangeEmbeddedSignupCode(code: string, redirectUri: string) {
  const readiness = metaProviderReadiness();
  if (!readiness.configured) throw new Error(`Meta provider setup is incomplete: ${readiness.missing.join(", ")}`);
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    code,
    redirect_uri: redirectUri,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${params}`, { cache: "no-store", signal: controller.signal }).finally(() => clearTimeout(timer));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(String(data?.error?.message || "Meta did not return an access token").slice(0, 500));
  return String(data.access_token);
}

export async function verifyMetaAssets(token: string, wabaId: string, phoneNumberId: string) {
  const [waba, phone] = await Promise.all([
    graph(`${encodeURIComponent(wabaId)}?fields=id,name,currency,timezone_id`, token),
    graph(`${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`, token),
  ]);
  return { waba, phone };
}

export async function createMetaTemplate(tokenEncrypted: string, wabaId: string, payload: object) {
  return graph(`${encodeURIComponent(wabaId)}/message_templates`, decryptSecret(tokenEncrypted), { method: "POST", body: JSON.stringify(payload) });
}

export async function listMetaTemplates(tokenEncrypted: string, wabaId: string) {
  return graph(`${encodeURIComponent(wabaId)}/message_templates?fields=id,name,language,category,status,components,rejected_reason&limit=250`, decryptSecret(tokenEncrypted));
}

export async function sendMetaTextMessage(tokenEncrypted: string, phoneNumberId: string, to: string, text: string) {
  return graph(`${encodeURIComponent(phoneNumberId)}/messages`, decryptSecret(tokenEncrypted), {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text } }),
  });
}

export async function sendMetaTemplateMessage(tokenEncrypted: string, phoneNumberId: string, to: string, name: string, language: string) {
  return graph(`${encodeURIComponent(phoneNumberId)}/messages`, decryptSecret(tokenEncrypted), {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: { name, language: { code: language } } }),
  });
}

export { encryptSecret };
