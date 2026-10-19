import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { adLinksAvailable } from "@/lib/plan-limits";
import { getMyLinks } from "@/lib/my-links";
import { defaultCountryForUser } from "@/lib/default-country";
import BackLink from "@/app/links/BackLink";
import AdForm from "./AdForm";

export const metadata = { title: "Create an ad link — Wazap", robots: { index: false, follow: false } };

export default async function NewAdLinkPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/links/new/ad");
  const userId = (session.user as { id: string }).id;

  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const planLabel = accountPlanLabel(entitlementUser);
  const { used, limit } = await getMyLinks(userId, plan);

  // Ad links are plan-gated (Growth/Agency only) in addition to the shared
  // pool - either reason sends the visitor back to the chooser, which
  // already explains why.
  if (!adLinksAvailable(plan) || used >= limit) redirect("/links/new");

  const defaultCountry = await defaultCountryForUser(userId, await headers());

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-2xl space-y-6">
        <BackLink href="/links/new" label="Create a link" />
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Ad link</h1>
          <p className="mt-1 text-slate-400">See exactly how many clicks each campaign brings.</p>
        </header>
        <AdForm planLabel={planLabel} used={used} limit={limit} defaultCountry={defaultCountry} />
      </div>
    </main>
  );
}
