import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import BillingManager from "../dashboard/BillingManager";
import PricingPlans from "../pricing/PricingPlans";
import FreePlanStrip from "../pricing/FreePlanStrip";
import PlanComparisonTable from "./PlanComparisonTable";
import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { getBillingSummary } from "@/lib/billing-summary";
import { getPlanDaysLeft, PLAN_PRICES } from "@/lib/billing";
import { accountPlanLabel, effectivePlan, isProductTrialActive, trialDaysLeft } from "@/lib/entitlements";
import { BILLING_PLAN_LABELS, billingStatusSentence, paymentStatusLabel } from "@/lib/billing-status-sentence";
import { normalizePlanKey, linkLimit, numbersPerRotatorLimit, adLinksAvailable } from "@/lib/plan-limits";
import { linkPlan } from "@/lib/router-entitlements";
import { countLiveLinks } from "@/lib/link-pool";

export const metadata = { title: "Plan & billing — Wazap", robots: { index: false, follow: false } };

// Real charges only: subscription pointer rows (subscription_active /
// subscription_inactive) are $0 bookkeeping, never a payment the customer
// made. Same exclusion as app/api/admin/billing/payments and
// CustomerPaymentsPanel use for admin's payment history.
const EXCLUDED_PAYMENT_STATUSES = ["subscription_active", "subscription_inactive", "provider_not_found", "inactive"];

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/billing");

  const sessionUser = session.user as { id: string; isAdmin?: boolean };
  const userId = sessionUser.id;

  const [user, billingSummary, firstPayment, payments, linksUsed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true, email: true },
    }),
    getBillingSummary(userId),
    prisma.payment.findFirst({
      where: { userId, method: { in: ["paypal", "dodo"] }, status: { in: ["active", "subscription_active"] } },
      orderBy: [{ activatedAt: "asc" }, { createdAt: "asc" }],
      select: { activatedAt: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { userId, method: { in: ["paypal", "dodo"] }, status: { notIn: EXCLUDED_PAYMENT_STATUSES } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, plan: true, amount: true, currency: true, method: true, status: true, createdAt: true, activatedAt: true },
    }),
    countLiveLinks(userId),
  ]);
  if (!user || !billingSummary) redirect("/login?redirect=/billing");

  const plan = effectivePlan(user);
  const inTrial = isProductTrialActive(user);
  const daysLeft = trialDaysLeft(user);
  const showBillingManager = billingSummary.plan !== "free" && !inTrial;

  const statusSentence = billingStatusSentence({
    plan: billingSummary.plan,
    inTrial,
    trialPlan: user.trialPlan,
    trialEndsAt: user.trialEndsAt,
    autoRenew: billingSummary.autoRenew,
    renewsOrExpiresAt: billingSummary.renewsOrExpiresAt,
    provider: billingSummary.provider,
    pendingChange: billingSummary.pendingChange,
  });

  const subscriptionStartDate = formatDate(firstPayment?.activatedAt || firstPayment?.createdAt || null);
  const daysLeftOnPeriod = getPlanDaysLeft(user.planExpiresAt);

  let nextPaymentDate: string | null = null;
  let nextPaymentAmount: number | null = null;
  if (billingSummary.plan !== "free") {
    if (billingSummary.pendingChange) {
      nextPaymentDate = formatDate(billingSummary.pendingChange.effectiveAt);
      nextPaymentAmount = PLAN_PRICES[billingSummary.pendingChange.toPlan] ?? null;
    } else if (billingSummary.autoRenew) {
      nextPaymentDate = formatDate(billingSummary.renewsOrExpiresAt);
      nextPaymentAmount = PLAN_PRICES[billingSummary.plan] ?? null;
    }
  }

  const providerLabel =
    billingSummary.provider === "dodo" ? "Card via Dodo" : billingSummary.provider === "paypal" ? "PayPal" : "Not on file";

  const planPrice = plan === "free" ? 0 : PLAN_PRICES[plan] ?? 0;

  // Usage card: same source as /links (lib/router-entitlements linkPlan +
  // lib/link-pool countLiveLinks) so the numbers here never disagree with
  // what actually gates link creation.
  const usagePlan = linkPlan(user);
  const linksLimit = linkLimit(usagePlan);
  const numbersLimit = numbersPerRotatorLimit(usagePlan);
  const hasAdLinks = adLinksAvailable(usagePlan);

  // Plan comparison + checkout: identical setup to the old /plans page -
  // same props, same components (PricingPlans/PlanChangeAction), so checkout
  // starts exactly the way it always has.
  const requestedPlan = params?.plan;
  const selectedPlan = ["basic", "pro", "ultimate"].includes(requestedPlan ?? "") ? requestedPlan ?? null : null;
  const billingPlanChangesEnabled = process.env.BILLING_PLAN_CHANGES_ENABLED === "true";
  const cardCheckoutEnabled =
    (process.env.DODO_ENVIRONMENT === "live_mode" ||
      (process.env.DODO_ENVIRONMENT === "test_mode" && process.env.NODE_ENV !== "production")) &&
    process.env.DODO_CHECKOUT_ENABLED === "true";
  const activeSubscription = await currentSubscriptionRecord(userId);
  const storedPlan = (user.plan || "free").toLowerCase();
  const currentPlanKey = storedPlan !== "free" ? normalizePlanKey(storedPlan) : null;
  const trialInfo = inTrial ? { plan: (user.trialPlan || "basic").toLowerCase(), daysLeft } : null;

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Plan & billing</h1>
          <p className="mt-1 text-slate-400">Your plan, usage, payment method and payment history.</p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-[#111811] p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold text-white">
              {accountPlanLabel(user)}
            </h2>
            <span className="text-lg font-semibold text-slate-300">{plan === "free" || inTrial ? "$0/mo" : `$${planPrice}/mo`}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{statusSentence}</p>

          {!inTrial && billingSummary.plan !== "free" && (
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscription started</dt>
                <dd className="mt-1 text-sm text-slate-200">{subscriptionStartDate || "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Days left this period</dt>
                <dd className="mt-1 text-sm text-slate-200">{daysLeftOnPeriod !== null ? `${daysLeftOnPeriod} day${daysLeftOnPeriod !== 1 ? "s" : ""}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next payment</dt>
                <dd className="mt-1 text-sm text-slate-200">
                  {nextPaymentDate && nextPaymentAmount !== null ? `$${nextPaymentAmount} on ${nextPaymentDate}` : "None scheduled"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment method</dt>
                <dd className="mt-1 text-sm text-slate-200">{providerLabel}</dd>
              </div>
            </dl>
          )}

          {/* Usage: same numbers as /links. */}
          <dl className="mt-5 grid gap-4 sm:grid-cols-3 border-t border-slate-800 pt-5">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Links used</dt>
              <dd className="mt-1 text-sm text-slate-200">{linksLimit > 0 ? `${linksUsed} of ${linksLimit} links used` : `${linksUsed} of 0 — choose a plan`}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Salespeople per lead rotator</dt>
              <dd className="mt-1 text-sm text-slate-200">Up to {numbersLimit} salespeople</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ad links</dt>
              <dd className="mt-1 text-sm text-slate-200">{hasAdLinks ? "✓ Included" : "✗ Not on this plan"}</dd>
            </div>
          </dl>

          {showBillingManager && (
            <BillingManager
              method={billingSummary.method}
              expiresAt={user.planExpiresAt?.toISOString() || null}
              billingPlanChangesEnabled={process.env.BILLING_PLAN_CHANGES_ENABLED === "true"}
              autoRenew={billingSummary.autoRenew}
              pendingChange={
                billingSummary.pendingChange
                  ? {
                      kind: billingSummary.pendingChange.kind,
                      toPlan: billingSummary.pendingChange.toPlan,
                      effectiveAt: billingSummary.pendingChange.effectiveAt ? billingSummary.pendingChange.effectiveAt.toISOString() : null,
                    }
                  : null
              }
            />
          )}

          {!showBillingManager && (
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-sm text-slate-300">
                {inTrial
                  ? `You're on a free trial — there's nothing to bill yet. ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left.`
                  : "Your free trial has ended — there's no billing to manage until you choose a plan."}
              </p>
              <a href="#plans" className="mt-2 inline-block text-sm font-semibold text-[#25D366] hover:underline">
                See plans ↓
              </a>
            </div>
          )}

          {/* BillingManager has its own "Change plan" link when plan changes are on. */}
          {showBillingManager && process.env.BILLING_PLAN_CHANGES_ENABLED !== "true" && (
            <a href="#plans" className="mt-4 block text-sm font-semibold text-[#25D366] hover:underline">
              Change plan ↓
            </a>
          )}
        </section>

        <PlanComparisonTable />

        <section id="plans" className="scroll-mt-10">
          <PricingPlans
            isLoggedIn
            freePlan={
              inTrial ? (
                <FreePlanStrip
                  isCurrent={false}
                  trialDaysLeft={daysLeft}
                  ctaHref={null}
                  note="You're on your 3-day free trial now. Your links pause when it ends unless you choose a plan."
                />
              ) : null
            }
            userEmail={session.user.email ?? null}
            cardCheckoutEnabled={cardCheckoutEnabled}
            selectedPlan={selectedPlan}
            activeSubscriptionPlan={activeSubscription?.plan || null}
            billingPlanChangesEnabled={billingPlanChangesEnabled}
            currentPlanKey={currentPlanKey}
            trialInfo={trialInfo}
            billing={
              billingSummary
                ? {
                    plan: billingSummary.plan,
                    accessActive: billingSummary.accessActive,
                    renewsOrExpiresAt: billingSummary.renewsOrExpiresAt ? billingSummary.renewsOrExpiresAt.toISOString() : null,
                    autoRenew: billingSummary.autoRenew,
                    hasSubscription: billingSummary.hasSubscription,
                    pendingChange: billingSummary.pendingChange
                      ? {
                          kind: billingSummary.pendingChange.kind,
                          toPlan: billingSummary.pendingChange.toPlan,
                          effectiveAt: billingSummary.pendingChange.effectiveAt ? billingSummary.pendingChange.effectiveAt.toISOString() : null,
                        }
                      : null,
                  }
                : null
            }
          />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#111811] p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Payment history</h2>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No payments recorded yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Plan</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-slate-900 last:border-0">
                      <td className="py-2 pr-4 text-slate-300">{formatDate(p.activatedAt || p.createdAt)}</td>
                      <td className="py-2 pr-4 text-slate-300">{BILLING_PLAN_LABELS[p.plan] || p.plan}</td>
                      <td className="py-2 pr-4 text-slate-300">
                        {p.currency} {p.amount.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-slate-300">{p.method === "dodo" ? "Card via Dodo" : "PayPal"}</td>
                      <td className="py-2 pr-4 text-slate-300">{paymentStatusLabel(p.status, p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
