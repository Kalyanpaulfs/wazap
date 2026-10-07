import { readFile } from "node:fs/promises";
import DodoPayments from "dodopayments";

const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.startsWith("#") && line.includes("=")).map(line => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "")];
}));

if (env.PAYPAL_PLAN_ID_BUSINESS || env.DODO_PRODUCT_ID_BUSINESS) {
  throw new Error("Business provider IDs already exist; refusing to create duplicates.");
}

const paypalBase = env.PAYPAL_ENVIRONMENT === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
const basicAuth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
const tokenResponse = await fetch(`${paypalBase}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
});
if (!tokenResponse.ok) throw new Error(`PayPal token failed: ${tokenResponse.status}`);
const { access_token: paypalToken } = await tokenResponse.json();

const teamPlanResponse = await fetch(`${paypalBase}/v1/billing/plans/${env.PAYPAL_PLAN_ID_ULTIMATE}`, {
  headers: { Authorization: `Bearer ${paypalToken}` },
});
if (!teamPlanResponse.ok) throw new Error(`Could not read PayPal Team plan: ${teamPlanResponse.status}`);
const teamPlan = await teamPlanResponse.json();

const paypalResponse = await fetch(`${paypalBase}/v1/billing/plans`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${paypalToken}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    "PayPal-Request-Id": "wazap-business-149-monthly-20260722",
  },
  body: JSON.stringify({
    product_id: teamPlan.product_id,
    name: "Wazap Business",
    description: "Wazap Business monthly software access and guided routing setup",
    status: "ACTIVE",
    billing_cycles: [{
      frequency: { interval_unit: "MONTH", interval_count: 1 },
      tenure_type: "REGULAR",
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: { fixed_price: { value: "149.00", currency_code: "USD" } },
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  }),
});
const paypalPlan = await paypalResponse.json();
if (!paypalResponse.ok) throw new Error(`PayPal plan creation failed: ${paypalResponse.status} ${JSON.stringify(paypalPlan).slice(0, 300)}`);

const dodo = new DodoPayments({
  bearerToken: env.DODO_PAYMENTS_API_KEY,
  environment: env.DODO_ENVIRONMENT || "test_mode",
});
const dodoProduct = await dodo.products.create({
  name: "Wazap Business",
  description: "Business WhatsApp workflow software with guided onboarding, managed routing destinations and priority support.",
  tax_category: "saas",
  price: {
    type: "recurring_price",
    currency: "USD",
    price: 14900,
    discount: 0,
    purchasing_power_parity: false,
    payment_frequency_count: 1,
    payment_frequency_interval: "Month",
    subscription_period_count: 20,
    subscription_period_interval: "Year",
    tax_inclusive: false,
    trial_period_days: 0,
  },
  metadata: { wazap_plan: "business" },
});

console.log(JSON.stringify({
  paypal: { id: paypalPlan.id, status: paypalPlan.status, price: paypalPlan.billing_cycles?.[0]?.pricing_scheme?.fixed_price },
  dodo: { id: dodoProduct.product_id, name: dodoProduct.name, price: dodoProduct.price },
}));
