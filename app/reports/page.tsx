import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Clock,
  Download,
  Link2,
  Lock,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getAssetDirectory } from "@/lib/performance";
import { salespersonName } from "@/lib/salesperson-names";
import { PLAN_DISPLAY_NAME, normalizePlanKey, reportsTier } from "@/lib/plan-limits";
import { PLAN_PRICES } from "@/lib/billing";
import {
  type ReportPeriod,
  REPORT_PERIODS,
  REPORT_PERIOD_LABELS,
  lastNDaysRange,
  isWithinRange,
  periodLengthDays,
  computeChange,
  formatChange,
  resolveFullTierSelection,
  toDateInputValue,
  CUSTOM_RANGE_MAX_YEARS_BACK,
  buildChatSeries,
} from "@/lib/reports";

export const metadata = { title: "Reports — Wazap", robots: { index: false, follow: false } };

type ConversationStartRow = {
  assetType: string;
  assetId: string | null;
  assetName: string | null;
  source: string | null;
  campaign: string | null;
  destination: string | null;
  createdAt: Date;
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(key: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00.000Z`));
}

function sourceCampaignLabel(source: string | null, campaign: string | null) {
  const sourceLabel = source?.trim() || "Direct / untagged";
  const campaignLabel = campaign?.trim();
  return campaignLabel ? `${sourceLabel} · ${campaignLabel}` : sourceLabel;
}

function groupCount<T>(list: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of list) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function busiestDay(list: ConversationStartRow[]) {
  const counts = groupCount(list, (item) => dayKey(item.createdAt));
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return { key: bestKey, count: bestCount };
}

function ChangeBadge({ change }: { change: ReturnType<typeof computeChange> }) {
  const color = change.isNew || change.direction === "up" ? "text-[#25D366]" : change.direction === "down" ? "text-red-400" : "text-slate-500";
  return <span className={`text-xs font-semibold ${color}`}>{formatChange(change)}</span>;
}

const BASIC_FEATURES = ["Last 30 days", "Chats per day", "Chats per link", "Chats per salesperson", "CSV download"];
const FULL_FEATURES = [
  "Everything in Basic",
  "Sources & campaigns",
  "Compare with previous period",
  "Any date range (up to 1 year)",
  "Location & device — coming soon",
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/reports");

  const userId = (session.user as { id: string }).id;
  const plan = (session.user as { plan?: string }).plan ?? "free";
  const tier = reportsTier(plan);
  const planName = PLAN_DISPLAY_NAME[normalizePlanKey(plan)];

  if (tier === "none") {
    return (
      <main className="px-4 py-7 sm:px-7 sm:py-9">
        <div className="mx-auto max-w-4xl space-y-6">
          <header className="text-center">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">Reports</p>
            <h1 className="mt-2 flex items-center justify-center gap-2 text-2xl font-bold text-white sm:text-3xl">
              <Lock className="h-6 w-6 text-slate-500" /> Reports start on Solo
            </h1>
            <p className="mt-2 text-slate-400">See chats per day, per link and per salesperson, with CSV export.</p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-3xl border border-slate-800 bg-[#111811] p-6">
              <h2 className="font-bold text-white">{`Basic reports · Solo $${PLAN_PRICES.basic}/mo`}</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
                {BASIC_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-[#25D366]" /> {feature}
                  </li>
                ))}
              </ul>
              <Link href="/plans" className="mt-6 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
                See plans
              </Link>
            </article>

            <article className="rounded-3xl border border-slate-800 bg-[#111811] p-6">
              <h2 className="font-bold text-white">{`Full reports · Growth $${PLAN_PRICES.pro}/mo`}</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
                {FULL_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-[#25D366]" /> {feature}
                  </li>
                ))}
              </ul>
              <Link href="/plans" className="mt-6 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
                See plans
              </Link>
            </article>
          </div>

          <p className="text-center text-sm text-slate-500">
            Your live numbers are on{" "}
            <Link href="/performance" className="text-[#25D366] underline">
              Performance
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  const membership = await getActiveWorkspace(userId);
  const workspace = membership.workspace as { name: string; ownerId: string } | undefined;
  if (!workspace) redirect("/workspace");

  const params = await searchParams;
  // Basic (Solo) reports are a fixed last-30-days window: no period picker,
  // no previous-period comparison, no sources/campaigns breakdown, and
  // from/to are ignored entirely (full tier only — enforced here).
  const selection = tier === "full" ? resolveFullTierSelection(params ?? {}) : null;
  const period: ReportPeriod = selection?.period ?? "this_month";
  const { current, previous } = selection
    ? { current: selection.current, previous: selection.previous }
    : { current: lastNDaysRange(30), previous: { start: new Date(0), end: new Date(0) } };

  const [{ index: assetIndex }, starts] = await Promise.all([
    getAssetDirectory(workspace.ownerId),
    prisma.conversationStart.findMany({
      where: { workspaceId: membership.workspaceId, createdAt: { gte: previous.start, lt: current.end } },
      select: { assetType: true, assetId: true, assetName: true, source: true, campaign: true, destination: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const currentStarts = starts.filter((item) => isWithinRange(item.createdAt, current));
  const previousStarts = starts.filter((item) => isWithinRange(item.createdAt, previous));

  // KPIs
  const chatsChange = computeChange(currentStarts.length, previousStarts.length);

  const countActiveLinks = (list: ConversationStartRow[]) => new Set(list.filter((item) => item.assetId).map((item) => item.assetId as string)).size;
  const activeLinksCurrent = countActiveLinks(currentStarts);
  const activeLinksChange = computeChange(activeLinksCurrent, countActiveLinks(previousStarts));

  const busiestCurrent = busiestDay(currentStarts);
  const busiestPrevious = busiestDay(previousStarts);
  const busiestChange = computeChange(busiestCurrent.count, busiestPrevious.count);

  const currentDays = periodLengthDays(current);
  const previousDays = periodLengthDays(previous);
  const avgCurrent = Math.round((currentStarts.length / currentDays) * 10) / 10;
  const avgPrevious = Math.round((previousStarts.length / previousDays) * 10) / 10;
  const avgChange = computeChange(avgCurrent, avgPrevious);

  // Top sources & campaigns (full tier only).
  const currentBySource = groupCount(currentStarts, (item) => sourceCampaignLabel(item.source, item.campaign));
  const previousBySource = groupCount(previousStarts, (item) => sourceCampaignLabel(item.source, item.campaign));
  const sourceLabels = new Set([...currentBySource.keys(), ...previousBySource.keys()]);
  const sourceRows = [...sourceLabels]
    .map((label) => {
      const current = currentBySource.get(label) ?? 0;
      const previous = previousBySource.get(label) ?? 0;
      return { label, current, previous, change: computeChange(current, previous) };
    })
    .sort((a, b) => b.current - a.current)
    .slice(0, 10);

  // By link.
  const linkMeta = new Map<string, { name: string; typeLabel: string }>();
  for (const [id, entry] of assetIndex) linkMeta.set(id, { name: entry.name, typeLabel: entry.typeLabel });
  for (const item of starts) {
    if (item.assetId && !linkMeta.has(item.assetId)) {
      linkMeta.set(item.assetId, {
        name: item.assetName?.trim() || item.assetType.replaceAll("_", " "),
        typeLabel: item.assetType.replaceAll("_", " "),
      });
    }
  }
  const currentByAsset = groupCount(currentStarts.filter((item) => item.assetId), (item) => item.assetId as string);
  const previousByAsset = groupCount(previousStarts.filter((item) => item.assetId), (item) => item.assetId as string);
  const linkRows = [...linkMeta.entries()]
    .map(([id, meta]) => {
      const current = currentByAsset.get(id) ?? 0;
      const previous = previousByAsset.get(id) ?? 0;
      return { id, ...meta, current, previous, change: computeChange(current, previous) };
    })
    .sort((a, b) => b.current - a.current);

  // By salesperson: grouped per rotator, each destination number within it.
  // Only rotators with chats in the current period (or the previous period,
  // for full-tier comparison) are shown.
  const rotatorIds = new Set(
    [...currentStarts, ...previousStarts].filter((item) => item.assetType === "rotator" && item.assetId).map((item) => item.assetId as string)
  );
  const salespersonGroups = [...rotatorIds]
    .map((id) => {
      const name = linkMeta.get(id)?.name ?? "Rotator";
      const numberNames = assetIndex.get(id)?.numberNames;
      const curRows = currentStarts.filter((item) => item.assetType === "rotator" && item.assetId === id);
      const prevRows = previousStarts.filter((item) => item.assetType === "rotator" && item.assetId === id);
      const curTotal = curRows.length;
      const prevTotal = prevRows.length;
      const curByDest = groupCount(curRows, (item) => item.destination || "Unknown");
      const prevByDest = groupCount(prevRows, (item) => item.destination || "Unknown");
      const destinations = [...new Set([...curByDest.keys(), ...prevByDest.keys()])]
        .map((destination) => {
          const count = curByDest.get(destination) ?? 0;
          const prevCount = prevByDest.get(destination) ?? 0;
          return {
            destination,
            salespersonName: salespersonName(numberNames, destination),
            count,
            pct: curTotal ? Math.round((count / curTotal) * 100) : 0,
            change: computeChange(count, prevCount),
          };
        })
        .sort((a, b) => b.count - a.count);
      return { id, name, curTotal, prevTotal, destinations };
    })
    .filter((group) => group.curTotal > 0 || (tier === "full" && group.prevTotal > 0))
    .sort((a, b) => b.curTotal - a.curTotal);

  // Chats per day (both tiers): zero-filled across the whole range, grouped
  // by week once the range is long enough to make a per-day chart unreadable.
  const dayCountsMap = groupCount(currentStarts, (item) => dayKey(item.createdAt));
  const chatSeries = buildChatSeries(dayCountsMap, current);
  const maxChatSeries = Math.max(1, ...chatSeries.map((point) => point.count));

  const isEmpty = currentStarts.length === 0;

  const todayInputValue = toDateInputValue(new Date());
  const earliestDate = new Date();
  earliestDate.setUTCFullYear(earliestDate.getUTCFullYear() - CUSTOM_RANGE_MAX_YEARS_BACK);
  const earliestCustomDate = toDateInputValue(earliestDate);
  const exportQuery = selection?.isCustom
    ? `from=${selection.fromValue}&to=${selection.toValue}`
    : `period=${period}`;

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">Reports</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Reports</h1>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
                {tier === "basic" ? "Basic" : "Full"} reports · {planName}
              </span>
            </div>
            <p className="mt-2 text-slate-400">
              {tier === "full"
                ? selection?.isCustom
                  ? `${selection.fromValue} to ${selection.toValue} for ${workspace.name}, compared with the same number of days before it.`
                  : `A period summary for ${workspace.name}, compared with the period before it.`
                : `A last-30-days summary for ${workspace.name}.`}
            </p>
          </div>
          <Link href="/performance" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-bold text-white hover:border-[#25D366]">
            Live performance <ArrowRight className="ml-1 inline h-4 w-4" />
          </Link>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          {tier === "full" && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a reporting period">
              {REPORT_PERIODS.map((value) => (
                <Link
                  key={value}
                  href={`/reports?period=${value}`}
                  aria-current={!selection?.isCustom && period === value ? "page" : undefined}
                  className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                    !selection?.isCustom && period === value ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {REPORT_PERIOD_LABELS[value]}
                </Link>
              ))}
            </div>
          )}
          {tier === "full" && selection && (
            <form
              action="/reports"
              method="get"
              className="flex flex-wrap items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5"
              aria-label="Custom date range"
            >
              <label className="flex items-center gap-1.5 text-sm text-slate-300">
                From
                <input
                  type="date"
                  name="from"
                  defaultValue={selection.fromValue}
                  min={earliestCustomDate}
                  max={todayInputValue}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white [color-scheme:dark]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-300">
                To
                <input
                  type="date"
                  name="to"
                  defaultValue={selection.toValue}
                  min={earliestCustomDate}
                  max={todayInputValue}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white [color-scheme:dark]"
                />
              </label>
              <button
                type="submit"
                className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
                  selection.isCustom ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                Apply range
              </button>
            </form>
          )}
          {tier === "basic" && (
            <span className="rounded-full border border-slate-700 px-4 py-1.5 text-sm font-semibold text-slate-300">Last 30 days</span>
          )}
          <span className="text-xs text-slate-600">Times in UTC</span>
          <a
            href={`/api/reports/export${tier === "full" ? `?${exportQuery}` : ""}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-4 py-1.5 text-sm font-semibold text-white hover:border-[#25D366]"
          >
            <Download className="h-4 w-4" /> Download CSV
          </a>
        </div>

        {tier === "full" && selection?.customError && (
          <p className="rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-300">
            {selection.customError} Showing {REPORT_PERIOD_LABELS[period]} instead.
          </p>
        )}
        {tier === "full" && selection?.clampedToToday && (
          <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2.5 text-sm text-slate-400">
            The To date was in the future, so it was adjusted to today.
          </p>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Period summary">
          {[
            { label: "Chats started", value: currentStarts.length.toLocaleString(), change: chatsChange, icon: Zap },
            { label: "Active links", value: activeLinksCurrent.toLocaleString(), change: activeLinksChange, icon: Link2 },
            {
              label: "Busiest day",
              value: busiestCurrent.key ? `${dayLabel(busiestCurrent.key)} · ${busiestCurrent.count}` : "—",
              change: busiestChange,
              icon: CalendarDays,
            },
            { label: "Avg chats / day", value: avgCurrent.toLocaleString(), change: avgChange, icon: TrendingUp },
          ].map(({ label, value, change, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-[#25D366]" />
                {tier === "full" && <ChangeBadge change={change} />}
              </div>
              <p className="mt-4 text-2xl font-bold text-white">{value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-300">{label}</p>
              {tier === "full" && <p className="mt-1 text-xs text-slate-600">vs previous period</p>}
            </article>
          ))}
        </section>

        {isEmpty ? (
          <section className="rounded-3xl border border-dashed border-slate-700 p-12 text-center">
            <BarChart3 className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-4 text-lg font-semibold text-white">No chats started in this period yet.</p>
            <p className="mt-1 text-sm text-slate-500">Share a tracked Wazap link or rotator to start seeing activity here.</p>
            <Link href="/tools/rotator" className="mt-5 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
              Create a lead routing link
            </Link>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="Chats per day">
              <h2 className="font-bold text-white">Chats per day</h2>
              <p className="mt-1 text-xs text-slate-500">
                {chatSeries.length && chatSeries[0].label.startsWith("Week of") ? "Grouped by week for long ranges." : "Every day in the period."}
              </p>
              <div className="mt-6 flex h-40 items-end gap-1" role="img" aria-label="Chats per day in the selected period">
                {chatSeries.map((point) => (
                  <div key={point.key} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <div className="text-[10px] text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">{point.count}</div>
                    <div
                      className="w-full rounded-t-md bg-[#25D366] transition-all"
                      style={{ height: `${Math.max(point.count ? 6 : 2, (point.count / maxChatSeries) * 120)}px`, opacity: point.count ? 0.85 : 0.12 }}
                      title={`${point.label}: ${point.count} chat${point.count === 1 ? "" : "s"}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className={`grid gap-5 ${tier === "full" ? "xl:grid-cols-2" : ""}`}>
              {tier === "full" && (
                <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
                  <div className="border-b border-slate-800 px-5 py-4"><h2 className="font-bold text-white">Sources &amp; campaigns</h2></div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-600">
                        <tr><th className="px-5 py-3">Source / campaign</th><th className="px-4 py-3">This period</th><th className="px-4 py-3">Previous</th><th className="px-4 py-3">Change</th></tr>
                      </thead>
                      <tbody>
                        {sourceRows.map((row) => (
                          <tr key={row.label} className="border-t border-slate-800/70">
                            <td className="px-5 py-3.5 font-semibold text-white">{row.label}</td>
                            <td className="px-4 py-3.5 text-slate-300">{row.current}</td>
                            <td className="px-4 py-3.5 text-slate-500">{row.previous}</td>
                            <td className="px-4 py-3.5"><ChangeBadge change={row.change} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              )}

              <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
                <div className="border-b border-slate-800 px-5 py-4"><h2 className="font-bold text-white">By link</h2></div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="sticky top-0 bg-[#111811] text-xs uppercase tracking-wide text-slate-600">
                      <tr><th className="px-5 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Chats</th>{tier === "full" && <><th className="px-4 py-3">Previous</th><th className="px-4 py-3">Change</th></>}</tr>
                    </thead>
                    <tbody>
                      {linkRows.length ? linkRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-800/70">
                          <td className="px-5 py-3.5 font-semibold text-white">{row.name}</td>
                          <td className="px-4 py-3.5"><span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs capitalize text-slate-300">{row.typeLabel}</span></td>
                          <td className="px-4 py-3.5 text-slate-300">{row.current}</td>
                          {tier === "full" && <><td className="px-4 py-3.5 text-slate-500">{row.previous}</td>
                          <td className="px-4 py-3.5"><ChangeBadge change={row.change} /></td></>}
                        </tr>
                      )) : (
                        <tr><td colSpan={tier === "full" ? 5 : 3} className="px-5 py-8 text-center text-slate-500">No links yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="By salesperson">
              <div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#25D366]" /><h2 className="font-bold text-white">By salesperson</h2></div>
              <p className="mt-1 text-xs text-slate-500">Chats per destination number, grouped by rotator, this period.</p>
              {salespersonGroups.length ? (
                <div className="mt-5 space-y-7">
                  {salespersonGroups.map((group) => (
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
                                <strong className="text-white">{row.count} · {row.pct}%</strong>
                                {tier === "full" && <ChangeBadge change={row.change} />}
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
              ) : (
                <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No rotator chats in this period.</p>
              )}
            </section>

            {tier === "basic" && (
              <section className="rounded-2xl border border-slate-800 bg-[#111811] p-5" aria-label="Unlock with Growth">
                <h2 className="font-bold text-white">Unlock with Growth</h2>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {["Sources & campaigns", "Compare with previous period", "Any date range"].map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-slate-500" /> {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/plans" className="mt-4 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
                  See plans
                </Link>
              </section>
            )}

            {tier === "full" && (
              <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500" aria-label="Location and device tracking">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> Location &amp; device tracking — coming soon</span>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
