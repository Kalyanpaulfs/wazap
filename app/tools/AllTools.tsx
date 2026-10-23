import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { getMyLinks, formatUsageLine } from "@/lib/my-links";
import { getToolCatalog } from "@/lib/tool-catalog";
import { TOOL_ICONS } from "@/app/components/tool-icons";
import { ToolCardLink, ToolComingSoonCard } from "@/app/components/ToolCard";

// "All tools" - the logged-in-customer landing for /tools (see
// app/tools/page.tsx, which renders this instead of the public SEO page
// once a session exists). Same catalog + card markup as app/links/new/
// page.tsx (lib/tool-catalog.ts, app/components/ToolCard.tsx), just with
// its own header/sidebar entry instead of the "Create a link" framing.
export default async function AllTools({ userId }: { userId: string }) {
  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const planLabel = accountPlanLabel(entitlementUser);
  const { used, limit } = await getMyLinks(userId, plan);

  const { paid, features, free } = getToolCatalog({ plan, used, limit });
  const anyLocked = paid.some((card) => card.locked) || features.some((card) => card.locked);

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">All tools</h1>
          <p className="mt-1 text-slate-400">Create links, track ads, and use free WhatsApp tools - all in one place.</p>
        </header>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Paid tools</h2>
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-400">Included in your plan · {formatUsageLine(planLabel, used, limit)}</p>
              {anyLocked && (
                <Link href="/billing#plans" className="text-sm font-semibold text-[#25D366] hover:underline">
                  See plans
                </Link>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {paid.map((card) => (
              <ToolCardLink key={card.id} card={card} Icon={TOOL_ICONS[card.iconKey]} />
            ))}
            {features.map((card) => (
              <ToolCardLink key={card.id} card={card} Icon={TOOL_ICONS[card.iconKey]} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Free tools</h2>
            <p className="text-sm text-slate-400">Free and unlimited on every plan</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {free.map((card) => (
              <ToolCardLink key={card.id} card={card} Icon={TOOL_ICONS[card.iconKey]} />
            ))}
            {free.length < 3 && <ToolComingSoonCard />}
          </div>
        </section>
      </div>
    </main>
  );
}
