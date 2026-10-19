import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { BarChart3, Check, Download, Link2, Lock, TrendingUp, Users, Zap } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_PRICES } from "@/lib/billing";
import { routerQuota, TRIAL_ROUTED_LEADS } from "@/lib/router-entitlements";
import { accountPlanLabel, isProductTrialActive, trialDaysLeft } from "@/lib/entitlements";
import { renameLinkTypeLabel, linkDetailsHref } from "@/lib/my-links";
import { getResultsPageData, type ResultsPageData } from "@/lib/reports-data";
import { RESULTS_PERIODS, RESULTS_PERIOD_LABELS, formatChange, sanitizeTimeZone, type Change } from "@/lib/reports";
import TzSync from "@/app/results/TzSync";
import LinkFilterSelect from "@/app/results/LinkFilterSelect";

export const metadata = { title: "Results — Wazap", robots: { index: false, follow: false } };

type Tab = "overview" | "salesperson" | "source" | "link";
const TAB_KEYS: Tab[] = ["overview", "salesperson", "source", "link"];
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "salesperson", label: "By salesperson" },
  { key: "source", label: "Ads & campaigns" },
  { key: "link", label: "By link" },
];

const BASIC_FEATURES = ["Today / 7 days / 30 days", "Clicks per day", "Clicks per link", "Clicks per salesperson", "CSV download"];
const FULL_FEATURES = [
  "Everything in Basic",
  "Ads & campaigns breakdown",
  "Compare with previous period",
  "Any custom date range (up to 1 year)",
  "Location & device — coming soon",
];

// Static, clearly-fake preview rows shown (blurred) on Basic's locked
// "Ads & campaigns" tab, so the lock reads as "there's more here",
// not an empty page.
const SOURCE_PREVIEW_ROWS = [
  { label: "Facebook · summer sale", current: 42 },
  { label: "Instagram", current: 27 },
  { label: "Google", current: 9 },
];

function ChangeBadge({ change }: { change: Change }) {
  const color = change.isNew || change.direction === "up" ? "text-[#25D366]" : change.direction === "down" ? "text-red-400" : "text-slate-500";
  return <span className={`text-xs font-semibold ${color}`}>{formatChange(change)}</span>;
}

function qsFrom(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  return qs.toString();
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string; compare?: string; link?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/results");

  const userId = (session.user as { id: string }).id;
  const plan = (session.user as { plan?: string }).plan ?? "free";

  const sp = await searchParams;
  const tab: Tab = TAB_KEYS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";

  const cookieStore = await cookies();
  const tz = sanitizeTimeZone(cookieStore.get("tz")?.value);

  const [resultsData, routerUser, rotatorLeadsUsed] = await Promise.all([
    getResultsPageData(userId, plan, { period: sp.period, from: sp.from, to: sp.to, compare: sp.compare, link: sp.link }, tz),
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
    }),
    prisma.conversationStart.count({ where: { userId, assetType: "rotator" } }),
  ]);

  if (resultsData.tier === "none") {
    return (
      <main className="px-4 py-7 sm:px-7 sm:py-9">
        <div className="mx-auto max-w-4xl space-y-6">
          <header className="text-center">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">Results</p>
            <h1 className="mt-2 flex items-center justify-center gap-2 text-2xl font-bold text-white sm:text-3xl">
              <Lock className="h-6 w-6 text-slate-500" /> Choose a plan to see your results
            </h1>
            <p className="mt-2 text-slate-400">Clicks per day, per link and per salesperson, with CSV export.</p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-3xl border border-slate-800 bg-[#111811] p-6">
              <h2 className="font-bold text-white">{`Basic results · Solo $${PLAN_PRICES.basic}/mo`}</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
                {BASIC_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-[#25D366]" /> {feature}
                  </li>
                ))}
              </ul>
              <Link href="/billing#plans" className="mt-6 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
                See plans
              </Link>
            </article>

            <article className="rounded-3xl border border-slate-800 bg-[#111811] p-6">
              <h2 className="font-bold text-white">{`Full results · Growth $${PLAN_PRICES.pro}/mo`}</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
                {FULL_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-[#25D366]" /> {feature}
                  </li>
                ))}
              </ul>
              <Link href="/billing#plans" className="mt-6 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
                See plans
              </Link>
            </article>
          </div>
        </div>
      </main>
    );
  }

  const data = resultsData as ResultsPageData & { tier: "basic" | "full" };
  const { selection, tier } = data;
  const now = new Date();
  const onActiveTrial = isProductTrialActive(routerUser, now);
  const quota = routerQuota(routerUser, rotatorLeadsUsed, now);
  const routingBlocked = onActiveTrial && !quota.allowed;
  const planName = accountPlanLabel(routerUser, now);

  const baseParams: Record<string, string | undefined> = {
    period: selection.isCustom ? undefined : selection.period,
    from: selection.isCustom ? selection.fromValue : undefined,
    to: selection.isCustom ? selection.toValue : undefined,
    compare: sp.compare,
    link: sp.link,
  };

  function hrefFor(overrides: Record<string, string | undefined> = {}): string {
    const merged: Record<string, string | undefined> = { ...baseParams, tab, ...overrides };
    if (merged.tab === "overview") merged.tab = undefined;
    const qs = qsFrom(merged);
    return qs ? `/results?${qs}` : "/results";
  }

  const tabNav = (
    <nav className="flex flex-wrap gap-2" aria-label="Results tabs">
      {TABS.map(({ key, label }) => (
        <Link
          key={key}
          href={hrefFor({ tab: key })}
          aria-current={tab === key ? "page" : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
            tab === key ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300 hover:border-slate-500"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );

  const compareOn = sp.compare !== "0";

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <TzSync />
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Results</h1>
            <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
              {tier === "basic" ? "Basic" : "Full"} · {planName}
            </span>
          </div>
          <p className="mt-1 text-slate-400">How many people clicked your links, where they came from, and who they went to.</p>
        </header>

        {routingBlocked && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5" aria-label="Links paused">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-white">
                You&apos;ve used the {TRIAL_ROUTED_LEADS} leads in your free trial. Choose a plan to keep routing.
              </p>
              <Link href="/billing#plans" className="text-sm font-semibold text-[#25D366] hover:underline">
                Choose a plan →
              </Link>
            </div>
          </section>
        )}

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a period">
            {RESULTS_PERIODS.map((value) => (
              <Link
                key={value}
                href={hrefFor({ period: value, from: undefined, to: undefined })}
                aria-current={!selection.isCustom && selection.period === value ? "page" : undefined}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  !selection.isCustom && selection.period === value
                    ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {RESULTS_PERIOD_LABELS[value]}
              </Link>
            ))}
          </div>

          {tier === "full" ? (
            <form action="/results" method="get" className="flex flex-wrap items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5" aria-label="Custom date range">
              <input type="hidden" name="tab" value={tab} />
              {sp.link && <input type="hidden" name="link" value={sp.link} />}
              {sp.compare && <input type="hidden" name="compare" value={sp.compare} />}
              <label className="flex items-center gap-1.5 text-sm text-slate-300">
                From
                <input
                  type="date"
                  suppressHydrationWarning
                  name="from"
                  defaultValue={selection.fromValue}
                  min={data.earliestCustomDate}
                  max={data.todayInputValue}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white [color-scheme:dark]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-300">
                To
                <input
                  type="date"
                  suppressHydrationWarning
                  name="to"
                  defaultValue={selection.toValue}
                  min={data.earliestCustomDate}
                  max={data.todayInputValue}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white [color-scheme:dark]"
                />
              </label>
              <button
                type="submit"
                className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
                  selection.isCustom ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                Custom range
              </button>
            </form>
          ) : (
            <Link
              href="/billing#plans"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 px-4 py-1.5 text-sm font-semibold text-slate-500 hover:border-slate-600"
            >
              <Lock className="h-3.5 w-3.5" /> Custom · Growth
            </Link>
          )}

          {tier === "full" && (
            <Link
              href={hrefFor({ compare: compareOn ? "0" : undefined })}
              aria-pressed={compareOn}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                compareOn ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              Compare with previous period
            </Link>
          )}

          <LinkFilterSelect
            options={data.linkOptions}
            value={sp.link ?? ""}
            params={{ tab, period: baseParams.period, from: baseParams.from, to: baseParams.to, compare: sp.compare }}
          />

          <a
            href={`/api/reports/export${data.exportQuery ? `?${data.exportQuery}` : ""}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-4 py-1.5 text-sm font-semibold text-white hover:border-[#25D366]"
          >
            <Download className="h-4 w-4" /> Download CSV
          </a>
        </div>

        {selection.isCustom === false && selection.customError && (
          <p className="rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-300">
            {selection.customError} Showing {RESULTS_PERIOD_LABELS[selection.period]} instead.
          </p>
        )}
        {selection.clampedToToday && (
          <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2.5 text-sm text-slate-400">
            The To date was in the future, so it was adjusted to today.
          </p>
        )}

        {/* Summary sentence */}
        <p className="text-slate-300">{data.summarySentence}</p>

        {/* 3 big numbers */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Results summary">
          <article className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
            <div className="flex items-center justify-between">
              <Zap className="h-5 w-5 text-[#25D366]" />
              {data.clicksChange && <ChangeBadge change={data.clicksChange} />}
            </div>
            <p className="mt-4 text-2xl font-bold text-white">{data.clicksCurrent.toLocaleString()}</p>
            <p className="mt-1 text-sm font-semibold text-slate-300">Clicks</p>
            {data.clicksChange && <p className="mt-1 text-xs text-slate-600">vs previous period</p>}
          </article>

          {data.busiestLink && (
            <article className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <div className="flex items-center justify-between">
                <Link2 className="h-5 w-5 text-[#25D366]" />
              </div>
              <p className="mt-4 text-2xl font-bold text-white">{data.busiestLink.clicks.toLocaleString()}</p>
              <p className="mt-1 text-sm font-semibold text-slate-300 truncate" title={data.busiestLink.name}>
                Busiest link · {data.busiestLink.name}
              </p>
            </article>
          )}

          {data.topSalesperson && (
            <article className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <div className="flex items-center justify-between">
                <Users className="h-5 w-5 text-[#25D366]" />
              </div>
              <p className="mt-4 text-2xl font-bold text-white">{data.topSalesperson.clicks.toLocaleString()}</p>
              <p className="mt-1 text-sm font-semibold text-slate-300 truncate" title={data.topSalesperson.name}>
                Top salesperson · {data.topSalesperson.name}
              </p>
            </article>
          )}
        </section>

        {tabNav}

        {tab === "overview" && (
          <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="Clicks per day">
            <h2 className="font-bold text-white">Clicks per day</h2>
            {data.isEmpty ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
                <BarChart3 className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-3">No clicks yet in {data.periodText}.</p>
                <Link href="/links/new" className="mt-4 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
                  Create a lead routing link
                </Link>
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  {data.chatSeries.length && data.chatSeries[0].label.startsWith("Week of") ? "Grouped by week for long ranges." : "Every day in the period."}
                </p>
                <div className="mt-6 flex h-40 items-end gap-1" role="img" aria-label="Clicks per day in the selected period">
                  {data.chatSeries.map((point) => (
                    <div key={point.key} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <div className="text-[10px] text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">{point.count}</div>
                      <div
                        className="w-full rounded-t-md bg-[#25D366] transition-all"
                        style={{ height: `${Math.max(point.count ? 6 : 2, (point.count / data.maxChatSeries) * 120)}px`, opacity: point.count ? 0.85 : 0.12 }}
                        title={`${point.label}: ${point.count} click${point.count === 1 ? "" : "s"}`}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
            {onActiveTrial && (
              <p className={`mt-5 text-sm font-semibold ${quota.used >= TRIAL_ROUTED_LEADS - 10 ? "text-red-400" : "text-slate-300"}`}>
                {quota.used} of {TRIAL_ROUTED_LEADS} trial leads used · {trialDaysLeft(routerUser, now)} day{trialDaysLeft(routerUser, now) !== 1 ? "s" : ""} left
              </p>
            )}
          </section>
        )}

        {tab === "link" && (
          <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="font-bold text-white">By link</h2>
            </div>
            {data.linkRows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No links yet.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Name</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Clicks</th>
                        <th className="px-4 py-3">Share</th>
                        {tier === "full" && compareOn && (
                          <>
                            <th className="px-4 py-3">Previous</th>
                            <th className="px-4 py-3">Change</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.linkRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-800/70">
                          <td className="px-5 py-3.5 font-semibold text-white">
                            <Link href={linkDetailsHref(row.filterType, row.id)} className="hover:underline">
                              {row.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">{renameLinkTypeLabel(row.typeLabel)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-300">{row.current}</td>
                          <td className="px-4 py-3.5 text-slate-300">{row.share}%</td>
                          {tier === "full" && compareOn && (
                            <>
                              <td className="px-4 py-3.5 text-slate-500">{row.previous}</td>
                              <td className="px-4 py-3.5">
                                <ChangeBadge change={row.change} />
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 p-4 sm:hidden">
                  {data.linkRows.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={linkDetailsHref(row.filterType, row.id)} className="font-semibold text-white hover:underline">
                          {row.name}
                        </Link>
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">{renameLinkTypeLabel(row.typeLabel)}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">
                        {row.current} clicks · {row.share}% share
                        {tier === "full" && compareOn && <> · <ChangeBadge change={row.change} /></>}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>
        )}

        {tab === "salesperson" && (
          <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="By salesperson">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#25D366]" />
              <h2 className="font-bold text-white">By salesperson</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">Clicks sent to each salesperson, grouped by lead rotator, this period.</p>
            {data.salespersonGroups.length ? (
              <>
                <div className="mt-5 space-y-7">
                  {data.salespersonGroups.map((group) => (
                    <div key={group.id}>
                      <p className="text-sm font-semibold text-white">{group.name}</p>
                      <div className="mt-3 space-y-3">
                        {group.destinations.map((row) => (
                          <div key={row.destination}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              {row.salespersonName ? (
                                <span>
                                  <span className="block font-semibold text-white">{row.salespersonName}</span>
                                  <span className="block font-mono text-xs text-slate-500">+{row.destination}</span>
                                </span>
                              ) : (
                                <span className="font-mono text-slate-300">+{row.destination}</span>
                              )}
                              <div className="flex items-center gap-2">
                                <strong className="text-white">
                                  {row.count} clicks · {row.pct}%
                                </strong>
                                {tier === "full" && compareOn && <ChangeBadge change={row.change} />}
                              </div>
                            </div>
                            <div className="mt-1.5 h-2 rounded-full bg-slate-900">
                              <div className="h-2 rounded-full bg-[#25D366]" style={{ width: `${Math.max(row.count ? 4 : 0, row.pct)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-xs text-slate-500">
                  Lead rotators take turns, so shares should be similar. A big gap can mean a number was added later or paused.
                </p>
              </>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No lead rotator clicks in this period.</p>
            )}
          </section>
        )}

        {tab === "source" && (
          tier === "full" ? (
            <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
              <div className="border-b border-slate-800 px-5 py-4">
                <h2 className="font-bold text-white">Ads &amp; campaigns</h2>
                <p className="mt-1 text-xs text-slate-500">Clicks on your ad links, by the source and campaign you set on each link. Lead rotators and WhatsApp links don&apos;t record where people came from. Use an ad link to track a source.</p>
              </div>
              {data.sourceRows.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500">
                  <p>No ad link clicks yet in {data.periodText}.</p>
                  <Link href="/links/new/ad" className="mt-3 inline-flex rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-[#25D366]">Create an ad link</Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Source / campaign</th>
                        <th className="px-4 py-3">This period</th>
                        {compareOn && (
                          <>
                            <th className="px-4 py-3">Previous</th>
                            <th className="px-4 py-3">Change</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.sourceRows.map((row) => (
                        <tr key={row.label} className="border-t border-slate-800/70">
                          <td className="px-5 py-3.5 font-semibold text-white">{row.label}</td>
                          <td className="px-4 py-3.5 text-slate-300">{row.current}</td>
                          {compareOn && (
                            <>
                              <td className="px-4 py-3.5 text-slate-500">{row.previous}</td>
                              <td className="px-4 py-3.5">
                                <ChangeBadge change={row.change} />
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          ) : (
            <article className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
              <div className="border-b border-slate-800 px-5 py-4">
                <h2 className="font-bold text-white">Ads &amp; campaigns</h2>
                <p className="mt-1 text-xs text-slate-500">Clicks on your ad links, by the source and campaign you set on each link. Lead rotators and WhatsApp links don&apos;t record where people came from. Use an ad link to track a source.</p>
              </div>
              <div className="overflow-x-auto pointer-events-none select-none opacity-60 blur-[3px] grayscale">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-5 py-3">Source / campaign</th>
                      <th className="px-4 py-3">This period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SOURCE_PREVIEW_ROWS.map((row) => (
                      <tr key={row.label} className="border-t border-slate-800/70">
                        <td className="px-5 py-3.5 font-semibold text-white">{row.label}</td>
                        <td className="px-4 py-3.5 text-slate-300">{row.current}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-[#111811]/40 p-5">
                <Link
                  href="/billing#plans"
                  className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]"
                >
                  <Lock className="h-4 w-4" /> Unlock with Growth
                </Link>
              </div>
            </article>
          )
        )}

        {tier === "full" && (
          <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500" aria-label="Location and device tracking">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Location &amp; device tracking — coming soon
            </span>
          </section>
        )}
      </div>
    </main>
  );
}
