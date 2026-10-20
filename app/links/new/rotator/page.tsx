import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { numbersPerRotatorLimit, nextPlanNumbersHint } from "@/lib/plan-limits";
import { getMyLinks } from "@/lib/my-links";
import { defaultCountryForUser } from "@/lib/default-country";
import BackLink from "@/app/links/BackLink";
import RotatorForm from "./RotatorForm";

export const metadata = { title: "Create a lead rotator", robots: { index: false, follow: false } };

export default async function NewRotatorPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/links/new/rotator");
  const userId = (session.user as { id: string }).id;

  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const planLabel = accountPlanLabel(entitlementUser);
  const { used, limit } = await getMyLinks(userId, plan);

  // Lead rotators aren't individually plan-gated (unlike ad links) - only
  // the shared pool can block creating one. Full pool -> back to the
  // chooser, which already shows the upgrade message.
  if (used >= limit) redirect("/links/new");

  const numbersLimit = numbersPerRotatorLimit(plan);
  const nextPlanHint = nextPlanNumbersHint(plan);
  const defaultCountry = await defaultCountryForUser(userId, await headers());

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-2xl space-y-6">
        <BackLink href="/links/new" label="Create a link" />
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Lead rotator</h1>
          <p className="mt-1 text-slate-400">Each new click goes to the next salesperson in your list.</p>
        </header>
        <RotatorForm planLabel={planLabel} used={used} limit={limit} numbersLimit={numbersLimit} nextPlanHint={nextPlanHint} defaultCountry={defaultCountry} />
      </div>
    </main>
  );
}
