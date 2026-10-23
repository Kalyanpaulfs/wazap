import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Copy, BarChart3, QrCode } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { getMyLinks, formatUsageLine, poolFullMessage } from "@/lib/my-links";
import { getToolCatalog } from "@/lib/tool-catalog";
import { TOOL_ICONS } from "@/app/components/tool-icons";
import { ToolCardLink, ToolComingSoonCard } from "@/app/components/ToolCard";
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
  const { paid, features, free: freeCards } = getToolCatalog({ plan, used, limit });
  // Everything under "Links" is paid, so Team outreach (it hands out a team
  // link) sits there too. Audience is a report, so it stays on All tools only.
  const linkCards = [...paid, ...features.filter((card) => card.id === "team-outreach")];

  const includedChips = [
    { Icon: QrCode, label: "Free QR code" },
    { Icon: Copy, label: "Copy & share" },
    { Icon: BarChart3, label: "Click tracking" },
  ];

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-5xl space-y-8">
        <BackLink href="/links" label="My links" />
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Create a link</h1>
          <p className="mt-1 text-slate-400">What do you want to do?</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="mr-1 text-slate-400">Every link includes:</span>
            {includedChips.map(({ Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-[#111811] px-3 py-1">
                <Icon className="h-3.5 w-3.5 text-[#25D366]" />
                {label}
              </span>
            ))}
          </div>
        </header>

        {!canCreate && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5" aria-label="Pool full">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{poolFullMessage(plan, used, limit)}</p>
              <Link href="/billing#plans" className="rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#1fba58]">
                See plans
              </Link>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Links</h2>
            <p className="text-sm text-slate-400">{formatUsageLine(planLabel, used, limit)}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {linkCards.map((card) => (
              <ToolCardLink key={card.id} card={card} Icon={TOOL_ICONS[card.iconKey]} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Free tools</h2>
            <p className="text-sm text-slate-400">Never counted against your plan.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {freeCards.map((card) => (
              <ToolCardLink key={card.id} card={card} Icon={TOOL_ICONS[card.iconKey]} />
            ))}
            {freeCards.length < 3 && <ToolComingSoonCard />}
          </div>
        </section>
      </div>
    </main>
  );
}
