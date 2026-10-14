// Creates the Wazap product + 4 monthly plans in PayPal SANDBOX and prints the
// PAYPAL_PLAN_ID_* lines to paste into the local env. Refuses to run on live.
// PAYPAL_ENVIRONMENT=sandbox PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... npx tsx scripts/paypal-sandbox-plans.ts
import { getPayPalEnvironment, paypalRequest } from "@/lib/paypal";
import { PLAN_PRICES } from "@/lib/billing";

const NAMES: Record<string, string> = { basic: "Solo", pro: "Growth", ultimate: "Agency", business: "Business" };

async function main() {
  if (getPayPalEnvironment() !== "sandbox") throw new Error("PAYPAL_ENVIRONMENT must be 'sandbox'. This script never touches live PayPal.");

  const product = await paypalRequest<{ id: string }>("/v1/catalogs/products", {
    method: "POST",
    body: JSON.stringify({ name: "Wazap (sandbox)", type: "SERVICE", category: "SOFTWARE" }),
  });

  for (const plan of ["basic", "pro", "ultimate", "business"]) {
    const created = await paypalRequest<{ id: string }>("/v1/billing/plans", {
      method: "POST",
      body: JSON.stringify({
        product_id: product.id,
        name: `Wazap ${NAMES[plan]} (sandbox)`,
        billing_cycles: [{
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR", sequence: 1, total_cycles: 0,
          pricing_scheme: { fixed_price: { value: PLAN_PRICES[plan].toFixed(2), currency_code: "USD" } },
        }],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
      }),
    });
    console.log(`PAYPAL_PLAN_ID_${plan.toUpperCase()}=${created.id}`);
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
