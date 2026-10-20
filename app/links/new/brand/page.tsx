import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { getMyLinks, originBase, stripProtocol } from "@/lib/my-links";
import { defaultCountryForUser } from "@/lib/default-country";
import BackLink from "@/app/links/BackLink";
import BrandForm from "./BrandForm";

export const metadata = { title: "Create a brand link", robots: { index: false, follow: false } };

export default async function NewBrandLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ simple?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/links/new/brand");
  const userId = (session.user as { id: string }).id;

  const sp = await searchParams;
  const simple = sp.simple === "1";

  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const planLabel = accountPlanLabel(entitlementUser);
  const { used, limit } = await getMyLinks(userId, plan);

  if (used >= limit) redirect("/links/new");

  const originHost = stripProtocol(originBase());
  const defaultCountry = await defaultCountryForUser(userId, await headers());

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-2xl space-y-6">
        <BackLink href="/links/new" label="Create a link" />
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{simple ? "Create a WhatsApp link" : "Brand link"}</h1>
          <p className="mt-1 text-slate-400">
            {simple
              ? "A short tracked link that opens your WhatsApp with a ready message."
              : "One link with your brand name that opens your WhatsApp."}
          </p>
        </header>
        <BrandForm planLabel={planLabel} used={used} limit={limit} originHost={originHost} defaultCountry={defaultCountry} simple={simple} />
      </div>
    </main>
  );
}
