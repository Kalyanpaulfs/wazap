import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PricingPlans from "../pricing/PricingPlans";
import FreePlanStrip from "../pricing/FreePlanStrip";
import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { getBillingSummary } from "@/lib/billing-summary";
import { isProductTrialActive, trialDaysLeft } from "@/lib/entitlements";
import { normalizePlanKey } from "@/lib/plan-limits";

export const metadata = { title: "Plans — Wazap", robots: { index: false, follow: false } };

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/plans");

  const sessionUser = session.user as { id: string; isAdmin?: boolean };
  if (sessionUser.isAdmin && params?.workspace !== "1") redirect("/admin/crm/overview");
  const userId = sessionUser.id;

  const requestedPlan = params?.plan;
  const selectedPlan = ["basic", "pro", "ultimate"].includes(requestedPlan ?? "") ? requestedPlan ?? null : null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true, email: true },
  });
  if (!user) redirect("/login?redirect=/plans");

  const billingPlanChangesEnabled = process.env.BILLING_PLAN_CHANGES_ENABLED === "true";
  const cardCheckoutEnabled =
    (process.env.DODO_ENVIRONMENT === "live_mode" ||
      (process.env.DODO_ENVIRONMENT === "test_mode" && process.env.NODE_ENV !== "production")) &&
    process.env.DODO_CHECKOUT_ENABLED === "true";

  const activeSubscription = await currentSubscriptionRecord(userId);
  const billingSummary = await getBillingSummary(userId);

  const storedPlan = (user.plan || "free").toLowerCase();
  const inTrial = isProductTrialActive(user);
  const daysLeft = trialDaysLeft(user);
  const currentPlanKey = storedPlan !== "free" ? normalizePlanKey(storedPlan) : null;
  const trialInfo = inTrial ? { plan: (user.trialPlan || "basic").toLowerCase(), daysLeft } : null;

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Plans</h1>
          <p className="mt-1 text-slate-400">Compare plans, see what each includes, and upgrade or downgrade any time.</p>
        </header>

        <div>
          <PricingPlans
            isLoggedIn
            freePlan={
              <FreePlanStrip
                isCurrent={storedPlan === "free" && !inTrial}
                trialDaysLeft={inTrial ? daysLeft : null}
                ctaHref={null}
                note={storedPlan === "free" ? "You're on your 3-day free trial now. Your links pause when it ends unless you choose a plan." : "Turn off auto-pay in Billing — your links pause when your current paid period ends."}
              />
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
        </div>
      </div>
    </main>
  );
}
