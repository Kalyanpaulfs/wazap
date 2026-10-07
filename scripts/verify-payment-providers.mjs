// Run on production: node --env-file=.env scripts/verify-payment-providers.mjs
// Read-only checks; no checkout, charge, customer mutation, or secret output.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import DodoPayments from "dodopayments";

const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); }
const live = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8" })).find(x => x.name === "wazap");
const saved = JSON.parse(fs.readFileSync("/root/.pm2/dump.pm2", "utf8")).find(x => x.name === "wazap");
check("Wazap online", live?.pm2_env.status === "online");
for (const key of Object.keys(process.env).filter(k => /^(DODO_|PAYPAL_)/.test(k))) {
  const override = live?.pm2_env[key];
  check(`${key}: runtime matches configuration`, !override || override === process.env[key]);
  const savedValue = saved?.[key] || saved?.env?.[key];
  check(`${key}: saved startup matches configuration`, saved && (!savedValue || savedValue === process.env[key]));
}
const prices = { BASIC: 900, PRO: 1900, ULTIMATE: 4900, BUSINESS: 14900 };
try {
  const dodo = new DodoPayments({ bearerToken: live.pm2_env.DODO_PAYMENTS_API_KEY || process.env.DODO_PAYMENTS_API_KEY, environment: "live_mode" });
  for (const [plan, cents] of Object.entries(prices)) {
    const product = await dodo.products.retrieve(process.env[`DODO_PRODUCT_ID_${plan}`]);
    check(`Dodo ${plan} price and currency`, product.price.price === cents && product.price.currency === "USD" && product.is_recurring);
  }
  const page = await dodo.webhooks.list();
  const hook = page.data.find(x => x.url === "https://wazap.lt/api/payment/dodo/webhook");
  check("Dodo webhook enabled", hook && !hook.disabled);
  if (hook) {
    const secret = await dodo.webhooks.retrieveSecret(hook.id);
    check("Dodo webhook secret matches provider", secret.secret === process.env.DODO_WEBHOOK_KEY);
  }
} catch { check("Dodo provider checks completed", false); }
try {
  const base = "https://api-m.paypal.com";
  const result = await fetch(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(15000) });
  const auth = await result.json();
  if (!result.ok || !auth.access_token) throw new Error("Provider authentication rejected");
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  for (const [plan, cents] of Object.entries(prices)) {
    const response = await fetch(`${base}/v1/billing/plans/${process.env[`PAYPAL_PLAN_ID_${plan}`]}`, { headers, signal: AbortSignal.timeout(15000) });
    const item = await response.json();
    const cycle = item.billing_cycles?.find(x => x.tenure_type === "REGULAR");
    check(`PayPal ${plan} active monthly price`, response.ok && item.status === "ACTIVE" && cycle?.frequency.interval_unit === "MONTH" && Math.round(Number(cycle.pricing_scheme?.fixed_price?.value) * 100) === cents && cycle.pricing_scheme?.fixed_price?.currency_code === "USD");
  }
  const response = await fetch(`${base}/v1/notifications/webhooks/${process.env.PAYPAL_WEBHOOK_ID}`, { headers, signal: AbortSignal.timeout(15000) });
  const hook = await response.json();
  check("PayPal webhook URL", response.ok && hook.url === "https://wazap.lt/api/payment/paypal/webhook");
} catch { check("PayPal provider checks completed", false); }
console.log(JSON.stringify({ passed: checks.filter(x => x.ok).length, failed: checks.filter(x => !x.ok).length, checks }, null, 2));
process.exitCode = checks.some(x => !x.ok) ? 1 : 0;
