import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { getMyLinks, formatUsageLine } from "@/lib/my-links";
import { getToolCatalog } from "@/lib/tool-catalog";
import { TOOL_ICONS } from "@/app/components/tool-icons";
import { ToolCardLink } from "@/app/components/ToolCard";

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

  const Section = ({ title, aside, cards }: { title: string; aside: React.ReactNode; cards: typeof paid }) => (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
        <div className="flex items-center gap-3 text-sm text-muted">{aside}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <ToolCardLink key={card.id} card={card} Icon={TOOL_ICONS[card.iconKey]} />
        ))}
      </div>
    </section>
  );

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-5xl space-y-10">
        <header>
          <h1 className="text-2xl font-bold text-text sm:text-3xl">All tools</h1>
          <p className="mt-1 text-muted">Links and free WhatsApp tools.</p>
        </header>
        <Section
          title="Link tools"
          cards={[...paid, ...features]}
          aside={
            <>
              <span>{formatUsageLine(planLabel, used, limit)}</span>
              {anyLocked && <Link href="/billing#plans" className="font-semibold text-accent hover:underline">See plans</Link>}
            </>
          }
        />
        <Section title="Free tools" cards={free} aside={<span>Unlimited on every plan</span>} />
      </div>
    </main>
  );
}
