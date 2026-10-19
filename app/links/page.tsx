import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, AlertTriangle } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { getMyLinks, filterLinks, formatUsageLine, linkKindFromFilterParam, LINK_FILTER_PARAM, LINK_KIND_NAME } from "@/lib/my-links";
import LinkRowActions from "./LinkRowActions";

export const metadata = { title: "My links — Wazap", robots: { index: false, follow: false } };

export default async function MyLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/links");
  const userId = (session.user as { id: string }).id;

  const sp = await searchParams;
  const kindFilter = linkKindFromFilterParam(sp.type);
  const q = (sp.q || "").trim();

  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const planLabel = accountPlanLabel(entitlementUser);

  const { rows, used, limit } = await getMyLinks(userId, plan);
  const visibleRows = filterLinks(rows, { kind: kindFilter, q });
  const hasAnyLinks = rows.length > 0;
  const noPlan = limit === 0;

  const tabs: { label: string; href: string; active: boolean }[] = [
    { label: "All", href: "/links", active: !kindFilter },
    { label: "Lead rotators", href: `/links?type=${LINK_FILTER_PARAM.rotator}`, active: kindFilter === "rotator" },
    { label: "WhatsApp links", href: `/links?type=${LINK_FILTER_PARAM.shortlink}`, active: kindFilter === "shortlink" },
    { label: "Ad links", href: `/links?type=${LINK_FILTER_PARAM.adlink}`, active: kindFilter === "adlink" },
  ];

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">My links</h1>
            <p className="mt-1 text-slate-400">All your WhatsApp links in one place.</p>
          </div>
          <Link
            href="/links/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]"
          >
            <Plus className="h-4 w-4" /> Create link
          </Link>
        </header>

        <p className="text-sm text-slate-400">{formatUsageLine(planLabel, used, limit)}</p>

        {noPlan && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5" aria-label="Links paused">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                <p className="text-sm font-semibold text-white">Your links are paused. Choose a plan to turn them back on.</p>
              </div>
              <Link href="/billing#plans" className="rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#1fba58]">
                Choose a plan
              </Link>
            </div>
          </section>
        )}

        {hasAnyLinks && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-2" aria-label="Filter by link type">
              {tabs.map((tab) => (
                <Link
                  key={tab.label}
                  href={tab.href}
                  aria-current={tab.active ? "page" : undefined}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                    tab.active ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
            {rows.length > 8 && (
              <form action="/links" method="GET" className="flex items-center gap-2">
                {kindFilter && <input type="hidden" name="type" value={LINK_FILTER_PARAM[kindFilter]} />}
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search by name"
                  maxLength={100}
                  className="rounded-full border border-slate-700 bg-slate-950 px-3.5 py-1.5 text-xs text-white placeholder-slate-600 focus:border-[#25D366] focus:outline-none"
                />
                <button className="rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-500">Search</button>
              </form>
            )}
          </div>
        )}

        {!hasAnyLinks ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
            <p className="text-white font-semibold">No links yet</p>
            <p className="mt-1 text-sm">Create your first link in 1 minute.</p>
            <Link href="/links/new" className="mt-4 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
              Create link
            </Link>
          </div>
        ) : !visibleRows.length ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
            <p>No links match this filter.</p>
            <Link href="/links" className="mt-3 inline-block text-sm font-semibold text-[#25D366] hover:underline">
              Clear filters
            </Link>
          </div>
        ) : (
          <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="Your links">
            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="py-3 pr-4">Name</th>
                    <th className="py-3 pr-4">Type</th>
                    <th className="py-3 pr-4">Address</th>
                    <th className="py-3 pr-4">Clicks</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={`${row.kind}-${row.id}`} className="border-t border-slate-800/70">
                      <td className="py-4 pr-4 font-semibold text-white">
                        <Link href={row.editHref} className="hover:text-[#25D366] hover:underline">
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{LINK_KIND_NAME[row.kind]}</span>
                      </td>
                      <td className="py-4 pr-4 font-mono text-xs text-slate-500">{row.addressDisplay}</td>
                      <td className="py-4 pr-4 text-slate-300">{row.metric.toLocaleString()}</td>
                      <td className="py-4 pr-4">
                        {row.paused ? (
                          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                            {row.statusText}
                          </span>
                        ) : (
                          <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-xs font-semibold text-[#25D366]">
                            ● Live
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <LinkRowActions id={row.id} kind={row.kind} name={row.name} publicUrl={row.publicUrl} editHref={row.editHref} manuallyPaused={row.manuallyPaused} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 sm:hidden">
              {visibleRows.map((row) => (
                <div key={`${row.kind}-${row.id}`} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={row.editHref} className="font-semibold text-white hover:text-[#25D366] hover:underline">
                        {row.name}
                      </Link>
                      <span className="mt-1 block w-fit rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-300">{LINK_KIND_NAME[row.kind]}</span>
                    </div>
                    {row.paused ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">{row.statusText}</span>
                    ) : (
                      <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-0.5 text-xs font-semibold text-[#25D366]">● Live</span>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{row.metric.toLocaleString()} clicks</p>
                  <div className="mt-2 break-all rounded-xl bg-slate-900 px-3 py-2 font-mono text-xs text-slate-400">{row.addressDisplay}</div>
                  <div className="mt-3">
                    <LinkRowActions id={row.id} kind={row.kind} name={row.name} publicUrl={row.publicUrl} editHref={row.editHref} manuallyPaused={row.manuallyPaused} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <Link
          href="/tools/widget"
          className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#111811] p-5 text-sm hover:border-[#25D366]"
        >
          <div>
            <p className="font-semibold text-white">Website button</p>
            <p className="mt-1 text-slate-400">Add a WhatsApp button to your website.</p>
          </div>
          <span className="font-semibold text-[#25D366]">Open →</span>
        </Link>
      </div>
    </main>
  );
}
