// Local QA for payment fixes PAY-2, PAY-3, PAY-4, PAY-6.
// Sends signed Dodo events and dev-mode PayPal events to the local server and
// prints what changed. Uses throwaway *@example.test accounts only.
//
// Needs: `npm run dev` on BASE_URL, a local DB, and in .env (local only):
//   DODO_WEBHOOK_KEY="whsec_..."  PAYMENT_WEBHOOK_DEV_SKIP_VERIFY="true"  PAYPAL_PLAN_ID_PRO="P-LOCAL-QA-PRO"
// Run: node scripts/qa-payment-fixes.mjs
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Webhook } from "standardwebhooks";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
}
const BASE = process.env.BASE_URL || "http://localhost:3000";
if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Refusing to run: DATABASE_URL is not a local database.");
const prisma = new PrismaClient();
const dodo = new Webhook(process.env.DODO_WEBHOOK_KEY);
const DAY = 86_400_000;
let failures = 0;

const day = date => (date ? new Date(date).toISOString().slice(0, 10) : "none");
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function sendDodo(type, data) {
  const id = `msg_${randomUUID()}`;
  const body = JSON.stringify({ type, timestamp: new Date().toISOString(), data });
  const now = new Date();
  const response = await fetch(`${BASE}/api/payment/dodo/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(Math.floor(now.getTime() / 1000)), "webhook-signature": dodo.sign(id, now, body) },
    body,
  });
  return { status: response.status, body: await response.json().catch(() => ({})), id };
}

async function sendPayPal(event_type, resource) {
  const body = JSON.stringify({ id: `WH-${randomUUID()}`, create_time: new Date().toISOString(), event_type, resource });
  const response = await fetch(`${BASE}/api/payment/paypal/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function freshUser(email) {
  if (!email.endsWith("@example.test")) throw new Error("QA only touches @example.test accounts");
  await prisma.$executeRaw`DELETE FROM "SecurityPaymentCharge" WHERE "paymentId" IN (SELECT "id" FROM "Payment" WHERE "email" = ${email})`;
  await prisma.$executeRaw`DELETE FROM "SecurityUserBilling" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "email" = ${email})`;
  await prisma.payment.deleteMany({ where: { email } });
  await prisma.user.deleteMany({ where: { email } });
  return prisma.user.create({ data: { email, name: "Payment QA", emailVerifiedAt: new Date() } });
}
const userState = id => prisma.user.findUniqueOrThrow({ where: { id }, select: { plan: true, planExpiresAt: true } });

async function dodoCharge(user, paymentId, nextBilling) {
  return sendDodo("payment.succeeded", {
    payment_id: paymentId, subscription_id: `sub_${user.id.slice(-6)}`, total_amount: 1900, currency: "USD",
    metadata: { user_id: user.id, plan: "pro", email: user.email },
    subscription: { subscription_id: `sub_${user.id.slice(-6)}`, next_billing_date: nextBilling?.toISOString() },
  });
}

async function main() {
  await prisma.securityRateLimit.deleteMany({});
  console.log(`\nPayment fixes QA against ${BASE}\n`);

  console.log("PAY-3  Access follows the provider's real billing date + 3 days grace");
  {
    const user = await freshUser("pay3-dodo@example.test");
    const nextBilling = new Date(Date.now() + 31 * DAY);
    const result = await dodoCharge(user, `pay_${randomUUID().slice(0, 8)}`, nextBilling);
    const after = await userState(user.id);
    check("Dodo payment activates Pro", result.status === 200 && after.plan === "pro", `HTTP ${result.status}`);
    check("Access until = next billing + 3 days", day(after.planExpiresAt) === day(new Date(nextBilling.getTime() + 3 * DAY)), `billing ${day(nextBilling)} → access until ${day(after.planExpiresAt)}; before the fix: ${day(new Date(Date.now() + 30 * DAY))}`);

    const pp = await freshUser("pay3-paypal@example.test");
    const ppNext = new Date(Date.now() + 31 * DAY);
    const activated = await sendPayPal("BILLING.SUBSCRIPTION.ACTIVATED", { id: `I-QA${Date.now()}`, custom_id: pp.id, plan_id: process.env.PAYPAL_PLAN_ID_PRO, billing_info: { next_billing_time: ppNext.toISOString() } });
    const ppAfter = await userState(pp.id);
    check("PayPal activation: access until next billing + 3 days", activated.status === 200 && ppAfter.plan === "pro" && day(ppAfter.planExpiresAt) === day(new Date(ppNext.getTime() + 3 * DAY)), `billing ${day(ppNext)} → access until ${day(ppAfter.planExpiresAt)}; before the fix: ${day(new Date(Date.now() + 30 * DAY))}`);
  }

  console.log("\nPAY-4  Expiry check never overwrites a renewal that just happened");
  {
    const user = await freshUser("pay4@example.test");
    const oldExpiry = new Date(Date.now() - DAY);
    await prisma.user.update({ where: { id: user.id }, data: { plan: "pro", planExpiresAt: oldExpiry } });
    const staleRead = await userState(user.id);
    await dodoCharge(user, `pay_${randomUUID().slice(0, 8)}`, new Date(Date.now() + 30 * DAY));
    // Same conditional update lib/billing-expiry.ts uses, with the stale read.
    const changed = await prisma.user.updateMany({ where: { id: user.id, plan: staleRead.plan, planExpiresAt: staleRead.planExpiresAt }, data: { plan: "free", planExpiresAt: null } });
    const after = await userState(user.id);
    check("Late expiry check is ignored, customer stays Pro", changed.count === 0 && after.plan === "pro", `plan ${after.plan}, until ${day(after.planExpiresAt)}; before the fix: downgraded to free`);
  }

  console.log("\nPAY-6  Payments Wazap can't match are kept and shown to the admin");
  {
    const before = await prisma.billingAttention.count();
    const unknown = await sendDodo("payment.succeeded", { payment_id: `pay_${randomUUID().slice(0, 8)}`, subscription_id: "sub_ghost", total_amount: 900, currency: "USD", metadata: { user_id: "no-such-user", plan: "basic", email: "ghost@example.test" } });
    check("Unknown customer: Dodo is told to retry (503), not 'OK'", unknown.status === 503, `HTTP ${unknown.status}; before the fix: 200 and the payment was dropped`);
    const noPlan = await sendDodo("payment.succeeded", { payment_id: `pay_${randomUUID().slice(0, 8)}`, subscription_id: "sub_other", total_amount: 500, currency: "USD", metadata: {} });
    check("No Wazap plan: accepted but recorded", noPlan.status === 200, `HTTP ${noPlan.status}`);
    const after = await prisma.billingAttention.count();
    check("Both appear in Admin → Billing 'Payments needing attention'", after - before >= 2, `${after - before} new items`);
  }

  console.log("\nPAY-2  Refunds and chargebacks remove paid access");
  {
    const user = await freshUser("pay2-refund@example.test");
    const chargeId = `pay_${randomUUID().slice(0, 8)}`;
    await dodoCharge(user, chargeId, new Date(Date.now() + 30 * DAY));
    const paid = await userState(user.id);
    const refund = await sendDodo("refund.succeeded", { refund_id: `ref_${randomUUID().slice(0, 6)}`, payment_id: chargeId, amount: 1900, currency: "USD", is_partial: false });
    const after = await userState(user.id);
    const payment = await prisma.payment.findFirst({ where: { txId: chargeId } });
    check("Full refund → plan back to Free", refund.status === 200 && paid.plan === "pro" && after.plan === "free", `before refund: ${paid.plan}; after: ${after.plan}; before the fix: stayed ${paid.plan}`);
    check("Payment marked refunded", payment?.status === "refunded", payment?.status);
    const again = await sendDodo("refund.succeeded", { refund_id: "dup", payment_id: chargeId, amount: 1900, currency: "USD" });
    check("Same refund twice is harmless", again.status === 200, `HTTP ${again.status}`);

    const partialUser = await freshUser("pay2-partial@example.test");
    const partialCharge = `pay_${randomUUID().slice(0, 8)}`;
    await dodoCharge(partialUser, partialCharge, new Date(Date.now() + 30 * DAY));
    await sendDodo("refund.succeeded", { refund_id: "partial", payment_id: partialCharge, amount: 500, currency: "USD", is_partial: true });
    const partialAfter = await userState(partialUser.id);
    const partialPayment = await prisma.payment.findFirst({ where: { txId: partialCharge } });
    check("Partial refund → access kept, flagged for review", partialAfter.plan === "pro" && partialPayment?.status === "partially_refunded", `${partialAfter.plan}, ${partialPayment?.status}`);

    const disputeUser = await freshUser("pay2-dispute@example.test");
    const disputeCharge = `pay_${randomUUID().slice(0, 8)}`;
    await dodoCharge(disputeUser, disputeCharge, new Date(Date.now() + 30 * DAY));
    await sendDodo("dispute.opened", { dispute_id: "dsp_1", payment_id: disputeCharge, amount: 1900, currency: "USD" });
    const opened = await userState(disputeUser.id);
    check("Dispute opened → access kept, flagged", opened.plan === "pro", opened.plan);
    await sendDodo("dispute.lost", { dispute_id: "dsp_1", payment_id: disputeCharge, amount: 1900, currency: "USD" });
    const lost = await userState(disputeUser.id);
    const lostPayment = await prisma.payment.findFirst({ where: { txId: disputeCharge } });
    check("Chargeback lost → plan back to Free", lost.plan === "free" && lostPayment?.status === "charged_back", `${lost.plan}, ${lostPayment?.status}`);

    const ppUser = await freshUser("pay2-paypal@example.test");
    const saleId = `SALE${Date.now()}`;
    await prisma.user.update({ where: { id: ppUser.id }, data: { plan: "pro", planExpiresAt: new Date(Date.now() + 30 * DAY) } });
    await prisma.payment.create({ data: { userId: ppUser.id, email: ppUser.email, plan: "pro", amount: 19, method: "paypal", txId: saleId, status: "active", activatedAt: new Date() } });
    const ppRefund = await sendPayPal("PAYMENT.SALE.REFUNDED", { id: `REF${Date.now()}`, sale_id: saleId, amount: { total: "19.00", currency: "USD" } });
    const ppAfter = await userState(ppUser.id);
    check("PayPal full refund → plan back to Free", ppRefund.status === 200 && ppAfter.plan === "free", `HTTP ${ppRefund.status}, ${ppAfter.plan}`);
  }

  console.log(`\n${failures ? `${failures} check(s) FAILED` : "All checks passed"}. See Admin → CRM → Billing for the 'Payments needing attention' list.\n`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
