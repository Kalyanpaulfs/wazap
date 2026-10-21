import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PricingPlans from "./PricingPlans";
import FreePlanStrip from "./FreePlanStrip";
import PricingViewTracker from "./PricingViewTracker";
import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { getBillingSummary } from "@/lib/billing-summary";
import { prisma } from "@/lib/prisma";
import { isProductTrialActive, trialDaysLeft } from "@/lib/entitlements";

export const metadata: Metadata = {
  title: "Pricing — WhatsApp Lead Router Plans",
  description: "Choose a Wazap plan for round-robin WhatsApp lead routing, campaign links, team distribution and conversation-start analytics.",
  keywords: ["whatsapp lead router pricing", "whatsapp link rotator pricing", "whatsapp round robin software", "whatsapp lead distribution"],
  alternates: { canonical: "https://wazap.lt/pricing" },
  openGraph: {
    title: "Wazap Pricing — WhatsApp Lead Routing Plans",
    description: "Start a 3-day free trial with 100 routed WhatsApp leads, then scale across campaigns and teams from $9/month.",
    url: "https://wazap.lt/pricing",
  },
};

const pricingJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Wazap",
    url: "https://wazap.lt/pricing",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: [
      { "@type": "Offer", name: "Solo", price: "9", priceCurrency: "USD" },
      { "@type": "Offer", name: "Growth", price: "19", priceCurrency: "USD" },
      { "@type": "Offer", name: "Agency", price: "49", priceCurrency: "USD" },
    ],
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const requestedPlan = (await searchParams).plan;
  const selectedPlan = ["basic", "pro", "ultimate"].includes(requestedPlan ?? "")
    ? requestedPlan ?? null
    : null;
  const isLoggedIn = !!session?.user;
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  const activeSubscription = sessionUserId ? await currentSubscriptionRecord(sessionUserId) : null;
  const billingPlanChangesEnabled = process.env.BILLING_PLAN_CHANGES_ENABLED === "true";
  const billingSummary = sessionUserId ? await getBillingSummary(sessionUserId) : null;
  // BUG-6: the signed-in banner needs trial state here too, same as /billing.
  const trialUser = sessionUserId
    ? await prisma.user.findUnique({ where: { id: sessionUserId }, select: { plan: true, trialPlan: true, trialEndsAt: true } })
    : null;
  const trialInfo = trialUser && isProductTrialActive(trialUser) ? { plan: (trialUser.trialPlan || "basic").toLowerCase(), daysLeft: trialDaysLeft(trialUser) } : null;
  const userEmail = session?.user?.email ?? null;
  // Same rule as /api/payment/dodo/create: test_mode only outside production.
  const cardCheckoutEnabled =
    (process.env.DODO_ENVIRONMENT === "live_mode" ||
      (process.env.DODO_ENVIRONMENT === "test_mode" && process.env.NODE_ENV !== "production")) &&
    process.env.DODO_CHECKOUT_ENABLED === "true";

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd).replace(/</g, "\\u003c") }} />
      <PricingViewTracker />
      <div className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-14">
            <h1 className="mx-auto mb-4 max-w-3xl text-4xl font-bold tracking-tight text-text sm:text-5xl">Route Every WhatsApp Lead to the Right Team Member</h1>
            <p className="mx-auto max-w-2xl text-lg leading-8 text-muted">Start a 3-day free trial with 100 routed leads. Choose a plan from $9/month to keep your public routing links active after the trial.</p>
            <div className="mt-3 flex items-center justify-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft border border-accent/30 px-4 py-1.5 text-sm text-accent">
                3-day free trial · everything in Solo · 100 leads · no card required
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft border border-accent/30 px-4 py-1.5 text-sm text-accent-hover">
                Secure monthly checkout
              </div>
            </div>
          </div>

          <PricingPlans
            isLoggedIn={isLoggedIn}
            userEmail={userEmail}
            freePlan={<FreePlanStrip />}
            cardCheckoutEnabled={cardCheckoutEnabled}
            selectedPlan={selectedPlan}
            activeSubscriptionPlan={activeSubscription?.plan || null}
            billingPlanChangesEnabled={billingPlanChangesEnabled}
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

          <div className="mt-10 rounded-2xl border border-border bg-surface p-6 text-center">
            <h2 className="text-xl font-semibold text-text">Paid plans keep your routing links active after the free trial</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted">Wazap does not read message content or require access to your WhatsApp account. Visitors are sent directly to the selected WhatsApp number.</p>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed text-muted">
            <h2 className="font-semibold text-text">Software access only</h2>
            <p className="mt-2">
              Payments purchase access to Wazap productivity software and higher usage limits. Wazap does not offer referral bonuses, commissions, affiliate payouts, financial rewards, or earnings opportunities.
            </p>
          </div>
        </div>
      </div>

    </>
  );
}
