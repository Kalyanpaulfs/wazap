import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { getMyLinks, formatUsageLine, poolFullMessage } from "@/lib/my-links";
import { getToolCatalog } from "@/lib/tool-catalog";
import { TOOL_ICONS } from "@/app/components/tool-icons";
import { ToolCardLink } from "@/app/components/ToolCard";
import BackLink from "@/app/links/BackLink";

export const metadata = { title: "Create a link", robots: { index: false, follow: false } };

export default async function NewLinkPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/links/new");
  const userId = (session.user as { id: string }).id;

  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const planLabel = accountPlanLabel(entitlementUser);
  const { used, limit } = await getMyLinks(userId, plan);

  const poolFull = used >= limit;
  const canCreate = !poolFull;

  // Both groups (the four pool-counted link types + the free tools) now
  // come from the shared catalog (lib/tool-catalog.ts) - see
  // app/tools/AllTools.tsx for the other page that renders the same list.
  const { paid: linkCards, free: freeCards } = getToolCatalog({ plan, used, limit });

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-5xl space-y-8">
        <BackLink href="/links" label="My links" />
        <header>
          <h1 className="text-2xl font-bold text-text sm:text-3xl">Create a link</h1>
          <p className="mt-1 text-muted">Choose a link type.</p>
        </header>

        {!canCreate && (
          <section className="rounded-2xl border border-warning/30 bg-highlight-soft p-5" aria-label="Pool full">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text">{poolFullMessage(plan, used, limit)}</p>
              <Link href="/billing#plans" className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover">
                See plans
              </Link>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-text">Links</h2>
            <p className="text-sm text-muted">{formatUsageLine(planLabel, used, limit)}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {linkCards.map((card) => (
              <ToolCardLink key={card.id} card={card} Icon={TOOL_ICONS[card.iconKey]} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-text">Free tools</h2>
            <p className="text-sm text-muted">Don't use your link limit</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {freeCards.map((card) => (
              <ToolCardLink key={card.id} card={card} Icon={TOOL_ICONS[card.iconKey]} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
