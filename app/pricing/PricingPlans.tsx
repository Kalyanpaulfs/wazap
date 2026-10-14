"use client";

import { CreditCard, LogIn, Star, Wallet } from "lucide-react";
import Link from "next/link";
import WazapCardPayment from "./WazapCardPayment";
import PlanChangeAction from "./PlanChangeAction";
import { PLAN_PRICES } from "@/lib/billing";
import { formatLocalPrice, useLocalization, usePricingText } from "@/app/pricing/local-price";

const PLAN_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, ultimate: 3, business: 4 };
const PLAN_LABELS: Record<string, string> = { free: "Free", basic: "Solo", pro: "Growth", ultimate: "Agency", business: "Business" };

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
    features: ["3 WhatsApp rotator links", "Unlimited routed leads", "Round-robin distribution", "Up to 100 destinations per rotator", "Click totals for every rotator", "Reliable fallback destination"],
    highlighted: false,
    salesOnly: false,
  },
  {
    id: "pro",
    name: "Growth",
    price: PLAN_PRICES.pro,
    description: "Run multiple campaigns and sales teams",
    features: ["10 WhatsApp rotator links", "Everything in Solo", "Conversation-start analytics", "Campaign and source reporting", "Tracked campaign links"],
    highlighted: true,
    salesOnly: false,
  },
  {
    id: "ultimate",
    name: "Agency",
    price: PLAN_PRICES.ultimate,
    description: "Unlimited routing for agencies and larger teams",
    features: ["Unlimited WhatsApp rotators", "Everything in Growth", "Workspace for up to 5 members", "Shared reporting and exports", "Priority support"],
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
}: {
  isLoggedIn: boolean;
  userEmail: string | null;
  cardCheckoutEnabled: boolean;
  selectedPlan?: string | null;
  activeSubscriptionPlan?: string | null;
  billingPlanChangesEnabled?: boolean;
  billing?: BillingInfo | null;
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
      <div className="mb-6 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" aria-hidden="true" />
        <span>Prices before applicable taxes. {text.estimated} · {localization.currency}{localization.currency !== "USD" ? ` · ${text.billedUsd}` : ""}</span>
      </div>

      {/* Not logged in — account gate */}
      {!isLoggedIn && (
        <div className="rounded-2xl border border-[#25D366]/30 bg-[#25D366]/5 p-5 mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-white font-semibold">{text.accountRequired}</p>
            <p className="text-slate-400 text-sm mt-0.5">Sign in or create an account, then choose your payment method. {text.paymentMethods}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-black/20 px-3 py-1 text-slate-200">
                <Wallet className="h-3.5 w-3.5" />
                PayPal available
              </span>
              {cardCheckoutEnabled && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-black/20 px-3 py-1 text-slate-200">
                  <CreditCard className="h-3.5 w-3.5" />
                  Card checkout
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login?redirect=/pricing" className="rounded-full border border-slate-600 hover:border-white px-5 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link href="/signup?redirect=/pricing" className="rounded-full bg-[#25D366] hover:bg-[#1fba58] px-5 py-2 text-sm font-semibold text-black transition-colors">
              Create Account
            </Link>
          </div>
        </div>
      )}

      {isLoggedIn && (
        <div className="rounded-2xl border border-slate-800 bg-[#111811] p-4 mb-6 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#25D366]" />
          <p className="text-sm text-slate-300">
            Signed in as <span className="text-white font-medium">{userEmail}</span> — {text.choosePlan}
          </p>
        </div>
      )}

      {activeSubscriptionPlan && !managedByPlanChanges && <div className="mb-6 rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-4 text-center text-sm text-green-200">You already have a subscription. <Link href="/dashboard#billing" className="font-semibold underline">Manage your existing plan</Link> before starting another.</div>}

      {selectedPlan && !activeSubscriptionPlan && !managedByPlanChanges && (
        <div className="mb-6 rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-4 text-center text-sm text-green-200">
          {isLoggedIn ? "Your account is ready. Continue with your selected plan below and choose PayPal or card checkout." : "Your selected plan is highlighted below. Create an account to continue to secure checkout."}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map((plan) => {
          const localPrice = formatLocalPrice(plan.price, localization);
          return (
          <div key={plan.id} dir={localization.direction} className={`relative min-w-0 rounded-2xl p-6 flex flex-col ${
            plan.highlighted || selectedPlan === plan.id
              ? "border-2 border-[#25D366] bg-[#25D366]/5 shadow-[0_0_40px_rgba(37,211,102,0.15)]"
              : "border border-slate-800 bg-[#111811]"
          }`}>
            {plan.highlighted && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[#25D366] px-4 py-1 text-xs font-semibold text-black">
                <Star className="h-3 w-3 fill-black" /> For growing teams
              </div>
            )}

            <div>
              <h2 className="text-xl font-bold text-white">{plan.name}</h2>
              <p className="text-slate-500 text-sm mt-1">{plan.description}</p>
              <div className="mt-5 mb-6 flex flex-wrap items-baseline gap-x-2">
                <span className="text-4xl font-bold tracking-tight text-white">{localPrice}</span>
                <span className="text-slate-500 text-sm">/ {text.month}</span>
              </div>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <span className="text-[#25D366] mt-0.5 shrink-0">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.salesOnly ? (
              <div className="space-y-2">
                <Link href="/contact?subject=Business%20plan" className="flex w-full items-center justify-center rounded-full bg-[#25D366] py-3 text-sm font-semibold text-black transition-colors hover:bg-[#1fba58]">
                  Talk to Wazap
                </Link>
                <p className="text-center text-xs text-slate-500">Tailored confirmation before billing</p>
              </div>
            ) : managedByPlanChanges && billing ? (
              billing.pendingChange ? (
                plan.id === billing.plan ? (
                  <p className="rounded-full border border-[#25D366]/40 bg-[#25D366]/10 py-3 text-center text-sm font-semibold text-[#25D366]">
                    {pendingNoteText}
                  </p>
                ) : (
                  <button type="button" disabled className="flex w-full cursor-not-allowed items-center justify-center rounded-full border border-slate-800 py-3 text-center text-sm font-semibold text-slate-500">
                    {pendingNoteText}
                  </button>
                )
              ) : plan.id === billing.plan ? (
                billing.autoRenew ? (
                  <button type="button" disabled className="flex w-full cursor-not-allowed items-center justify-center rounded-full border border-slate-800 py-3 text-center text-sm font-semibold text-slate-500">
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
              <Link href="/dashboard#billing" className="block rounded-full border border-[#25D366] py-3 text-center text-sm font-semibold text-[#25D366]">Manage existing subscription →</Link>
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
                <div className={`grid gap-2 text-xs font-semibold text-slate-300 ${cardCheckoutEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
                  <div className="flex items-center justify-center gap-1.5 rounded-full border border-slate-800 bg-black/20 py-2">
                    <Wallet className="h-3.5 w-3.5" />
                    PayPal
                  </div>
                  {cardCheckoutEnabled && (
                    <div className="flex items-center justify-center gap-1.5 rounded-full border border-slate-800 bg-black/20 py-2">
                      <CreditCard className="h-3.5 w-3.5" />
                      Card
                    </div>
                  )}
                </div>
                <Link
                  href={`/signup?redirect=${encodeURIComponent(`/pricing?plan=${plan.id}`)}`}
                  className="flex items-center justify-center gap-2 w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] py-3 text-sm font-semibold text-black transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  Create account, then {plan.name} — {localPrice}/{text.month}
                </Link>
                <Link href={`/login?redirect=${encodeURIComponent(`/pricing?plan=${plan.id}`)}`} className="block text-center text-sm text-[#25D366] hover:underline">
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
