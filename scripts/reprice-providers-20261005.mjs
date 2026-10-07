import fs from "node:fs";
import DodoPayments from "dodopayments";

const prices = { basic: 9, pro: 19, ultimate: 49 };
const labels = { basic: "Wazap Solo", pro: "Wazap Growth", ultimate: "Wazap Agency" };
const envKeys = { basic: "BASIC", pro: "PRO", ultimate: "ULTIMATE" };

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function paypalRequest(path, init = {}) {
  const base = process.env.PAYPAL_ENVIRONMENT === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
  const auth = Buffer.from(`${required("PAYPAL_CLIENT_ID")}:${required("PAYPAL_CLIENT_SECRET")}`).toString("base64");
  const tokenResponse = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) throw new Error(`PayPal token failed: ${tokenResponse.status}`);
  const { access_token: token } = await tokenResponse.json();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`PayPal ${path} failed: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const newPayPalPlanIds = {};
for (const [plan, price] of Object.entries(prices)) {
  const oldPlanId = required(`PAYPAL_PLAN_ID_${envKeys[plan]}`);
  const oldPlan = await paypalRequest(`/v1/billing/plans/${oldPlanId}`);
  const created = await paypalRequest("/v1/billing/plans", {
    method: "POST",
    headers: { Prefer: "return=representation", "PayPal-Request-Id": `wazap-${plan}-${price}-20261005` },
    body: JSON.stringify({
      product_id: oldPlan.product_id,
      name: `${labels[plan]} - $${price} monthly`,
      description: `${labels[plan]} monthly software subscription`,
      status: "ACTIVE",
      billing_cycles: [{
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: String(price), currency_code: "USD" } },
      }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
    }),
  });
  newPayPalPlanIds[plan] = created.id;
}

const dodo = new DodoPayments({
  bearerToken: required("DODO_PAYMENTS_API_KEY"),
  environment: process.env.DODO_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode",
});
for (const [plan, price] of Object.entries(prices)) {
  const id = required(`DODO_PRODUCT_ID_${envKeys[plan]}`);
  const product = await dodo.products.retrieve(id);
  if (product.price.type !== "recurring_price") throw new Error(`${plan} Dodo product is not recurring`);
  await dodo.products.update(id, {
    name: labels[plan],
    price: { ...product.price, price: price * 100 },
  });
}

const envPath = process.argv[2] || ".env";
let envText = fs.readFileSync(envPath, "utf8");
for (const [plan, id] of Object.entries(newPayPalPlanIds)) {
  const key = `PAYPAL_PLAN_ID_${envKeys[plan]}`;
  const line = `${key}=${id}`;
  envText = new RegExp(`^${key}=.*$`, "m").test(envText)
    ? envText.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${envText.trimEnd()}\n${line}\n`;
}
fs.writeFileSync(envPath, envText, { mode: 0o600 });
console.log(JSON.stringify({ paypalPlansUpdated: Object.keys(newPayPalPlanIds), dodoProductsUpdated: Object.keys(prices) }));
