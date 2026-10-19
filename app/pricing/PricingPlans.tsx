"use client";

import { CreditCard, LogIn, Star, Wallet } from "lucide-react";
import Link from "next/link";
import WazapCardPayment from "./WazapCardPayment";
import PlanChangeAction from "./PlanChangeAction";
import { PLAN_PRICES } from "@/lib/billing";
import { formatLocalPrice, useLocalization, usePricingText } from "@/app/pricing/local-price";

const PLAN_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, ultimate: 3, business: 4 };
const PLAN_LABELS: Record<string, string> = { free: "Free trial ended", basic: "Solo", pro: "Growth", ultimate: "Agency", business: "Business" };

type PendingPlanChange = { kind: string; toPlan: string; effectiveAt: string | null };
type BillingInfo = {
  plan: string;
  accessActive: boolean;
  renewsOrExpiresAt: string | null;
  autoRenew: boolean;
  hasSubscription: boolean;
  pendingChange: PendingPlanChange | null;
};

const PLANS = [
  {
    id: "basic",
    name: "Solo",
    price: PLAN_PRICES.basic,
    description: "Route leads for one small sales team",
    features: ["5 links — lead rotator, WhatsApp link or brand link", "Up to 3 salespeople per lead rotator", "Website button", "WhatsApp QR code — unlimited", "Unlimited routed leads", "Basic reports (last 30 days)", "Basic support"],
    highlighted: false,
    salesOnly: false,
  },
  {
    id: "pro",
    name: "Growth",
    price: PLAN_PRICES.pro,
    description: "Run multiple campaigns and sales teams",
    features: ["20 links, any type — including ad links", "Up to 10 salespeople per lead rotator", "Everything in Solo, plus ad links", "Full reports — sources, campaigns & date range", "Standard support · location & device tracking (coming soon)"],
    highlighted: true,
    salesOnly: false,
  },
  {
    id: "ultimate",
    name: "Agency",
    price: PLAN_PRICES.ultimate,
    description: "High-volume routing for agencies and larger teams",
    features: ["55 links, any type", "Up to 20 salespeople per lead rotator", "Everything in Growth", "Full reports with shared exports", "Priority support"],
    highlighted: false,
    salesOnly: false,
  },
];

export default function PricingPlans({
  isLoggedIn,
  userEmail,
  cardCheckoutEnabled,
  selectedPlan,
  activeSubscriptionPlan,
  billingPlanChangesEnabled = false,
  billing = null,
  currentPlanKey = null,
  trialInfo = null,
  freePlan = null,
}: {
  isLoggedIn: boolean;
  userEmail: string | null;
  cardCheckoutEnabled: boolean;
  selectedPlan?: string | null;
  activeSubscriptionPlan?: string | null;
  billingPlanChangesEnabled?: boolean;
  billing?: BillingInfo | null;
  // /plans only (left null on /pricing, which keeps today's exact look):
  // marks the user's actual current plan, and a trial pill when relevant.
  currentPlanKey?: string | null;
  trialInfo?: { plan: string; daysLeft: number } | null;
  // Free plan card (server-rendered FreePlanStrip), shown first in the grid.
  freePlan?: React.ReactNode;
}) {
  const localization = useLocalization();
  const text = usePricingText(localization.language);
  const managedByPlanChanges = billingPlanChangesEnabled && !!billing && billing.hasSubscription && billing.accessActive;
  const renewsOrExpiresAtLabel = billing?.renewsOrExpiresAt ? new Date(billing.renewsOrExpiresAt).toLocaleDateString("en-GB") : null;
  const pendingNoteText = billing?.pendingChange
    ? `Changes to ${PLAN_LABELS[billing.pendingChange.toPlan] || billing.pendingChange.toPlan} on ${
        billing.pendingChange.effectiveAt ? new Date(billing.pendingChange.effectiveAt).toLocaleDateString("en-GB") : "your next billing date"
      }`
    : null;

  return (
    <>
      <div className="mb-6 flex items-center justify-center gap-2 text-center text-xs text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        <span>Prices before applicable taxes. {text.estimated} · {localization.currency}{localization.currency !== "USD" ? ` · ${text.billedUsd}` : ""}</span>
      </div>

      {/* Not logged in — account gate */}
      {!isLoggedIn && (
        <div className="rounded-2xl border border-accent/30 bg-accent-soft p-5 mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-text font-semibold">{text.accountRequired}</p>
            <p className="text-muted text-sm mt-0.5">Sign in or create an account, then choose your payment method. {text.paymentMethods}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-bg/20 px-3 py-1 text-text">
                <Wallet className="h-3.5 w-3.5" />
                PayPal available
              </span>
              {cardCheckoutEnabled && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-bg/20 px-3 py-1 text-text">
                  <CreditCard className="h-3.5 w-3.5" />
                  Card checkout
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login?redirect=/pricing" className="rounded-full border border-border-strong hover:border-muted px-5 py-2 text-sm font-semibold text-muted hover:text-text transition-colors">
              Sign In
            </Link>
            <Link href="/signup?redirect=/pricing" className="rounded-full bg-accent hover:bg-accent-hover px-5 py-2 text-sm font-semibold text-on-accent transition-colors">
              Create Account
            </Link>
          </div>
        </div>
      )}

      {isLoggedIn && (
        <div className="rounded-2xl border border-border bg-surface p-4 mb-6 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <p className="text-sm text-muted">
            Signed in as <span className="text-text font-medium">{userEmail}</span> — {text.choosePlan}
          </p>
        </div>
      )}

      {activeSubscriptionPlan && !managedByPlanChanges && <div className="mb-6 rounded-2xl border border-accent/40 bg-accent-soft p-4 text-center text-sm text-accent-hover">You already have a subscription. <Link href="/billing" className="font-semibold underline">Manage your existing plan</Link> before starting another.</div>}

      {selectedPlan && !activeSubscriptionPlan && !managedByPlanChanges && (
        <div className="mb-6 rounded-2xl border border-accent/40 bg-accent-soft p-4 text-center text-sm text-accent-hover">
          {isLoggedIn ? "Your account is ready. Continue with your selected plan below and choose PayPal or card checkout." : "Your selected plan is highlighted below. Create an account to continue to secure checkout."}
        </div>
      )}

      <div className={`grid grid-cols-1 gap-5 ${freePlan ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
        {freePlan}
        {PLANS.map((plan) => {
          const localPrice = formatLocalPrice(plan.price, localization);
          return (
          <div key={plan.id} dir={localization.direction} className={`relative min-w-0 rounded-2xl p-6 flex flex-col ${
            plan.highlighted || selectedPlan === plan.id
              ? "border-2 border-accent bg-accent-soft shadow-[0_0_40px_rgba(15,169,104,0.18)]"
              : "border border-border bg-surface"
          }`}>
            {plan.highlighted && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-4 py-1 text-xs font-semibold text-on-accent">
                <Star className="h-3 w-3 fill-current" /> For growing teams
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-text">{plan.name}</h2>
                {currentPlanKey === plan.id && (
                  <span className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                    Current plan
                  </span>
                )}
              </div>
              <p className="text-muted text-sm mt-1">{plan.description}</p>
              <div className="mt-5 mb-6 flex flex-wrap items-baseline gap-x-2">
                <span className="text-4xl font-bold tracking-tight text-text">{localPrice}</span>
                <span className="text-muted text-sm">/ {text.month}</span>
              </div>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-muted">
                  <span className="text-accent mt-0.5 shrink-0">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.salesOnly ? (
              <div className="space-y-2">
                <Link href="/contact?subject=Business%20plan" className="flex w-full items-center justify-center rounded-full bg-accent py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover">
                  Talk to Wazap
                </Link>
                <p className="text-center text-xs text-muted">Tailored confirmation before billing</p>
              </div>
            ) : managedByPlanChanges && billing ? (
              billing.pendingChange ? (
                plan.id === billing.plan ? (
                  <p className="rounded-full border border-accent/40 bg-accent-soft py-3 text-center text-sm font-semibold text-accent">
                    {pendingNoteText}
                  </p>
                ) : (
                  <button type="button" disabled className="flex w-full cursor-not-allowed items-center justify-center rounded-full border border-border py-3 text-center text-sm font-semibold text-muted">
                    {pendingNoteText}
                  </button>
                )
              ) : plan.id === billing.plan ? (
                billing.autoRenew ? (
                  <button type="button" disabled className="flex w-full cursor-not-allowed items-center justify-center rounded-full border border-border py-3 text-center text-sm font-semibold text-muted">
                    Current plan · renews automatically on {renewsOrExpiresAtLabel || "your renewal date"}
                  </button>
                ) : (
                  <PlanChangeAction
                    kind="renew"
                    planId={plan.id}
                    planLabel={plan.name}
                    currentPlanLabel={PLAN_LABELS[billing.plan] || billing.plan}
                    renewsOrExpiresAtLabel={renewsOrExpiresAtLabel}
                    locale={localization.language}
                    country={localization.country}
                    cardCheckoutEnabled={cardCheckoutEnabled}
                    subscribePaypalLabel={text.subscribePaypal}
                    subscribeCardLabel={text.subscribeCard}
                  />
                )
              ) : (
                <PlanChangeAction
                  kind={(PLAN_RANK[plan.id] ?? 0) > (PLAN_RANK[billing.plan] ?? 0) ? "upgrade" : "downgrade"}
                  planId={plan.id}
                  planLabel={plan.name}
                  currentPlanLabel={PLAN_LABELS[billing.plan] || billing.plan}
                  renewsOrExpiresAtLabel={renewsOrExpiresAtLabel}
                  locale={localization.language}
                  country={localization.country}
                  cardCheckoutEnabled={cardCheckoutEnabled}
                  subscribePaypalLabel={text.subscribePaypal}
                  subscribeCardLabel={text.subscribeCard}
                />
              )
            ) : activeSubscriptionPlan ? (
              <Link href="/billing" className="block rounded-full border border-accent py-3 text-center text-sm font-semibold text-accent">Manage existing subscription →</Link>
            ) : isLoggedIn ? (
              <WazapCardPayment
                planName={plan.id}
                locale={localization.language}
                country={localization.country}
                cardCheckoutEnabled={cardCheckoutEnabled}
                subscribePaypalLabel={text.subscribePaypal}
                subscribeCardLabel={text.subscribeCard}
              />
            ) : (
              <div className="space-y-3">
                <div className={`grid gap-2 text-xs font-semibold text-muted ${cardCheckoutEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
                  <div className="flex items-center justify-center gap-1.5 rounded-full border border-border bg-bg/20 py-2">
                    <Wallet className="h-3.5 w-3.5" />
                    PayPal
                  </div>
                  {cardCheckoutEnabled && (
                    <div className="flex items-center justify-center gap-1.5 rounded-full border border-border bg-bg/20 py-2">
                      <CreditCard className="h-3.5 w-3.5" />
                      Card
                    </div>
                  )}
                </div>
                <Link
                  href={`/signup?redirect=${encodeURIComponent(`/pricing?plan=${plan.id}`)}`}
                  className="flex items-center justify-center gap-2 w-full rounded-full bg-accent hover:bg-accent-hover py-3 text-sm font-semibold text-on-accent transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  Create account, then {plan.name} — {localPrice}/{text.month}
                </Link>
                <Link href={`/login?redirect=${encodeURIComponent(`/pricing?plan=${plan.id}`)}`} className="block text-center text-sm text-accent hover:underline">
                  Already have an account? Sign in for {plan.name}
                </Link>
              </div>
            )}
          </div>
        )})}
      </div>
    </>
  );
}
