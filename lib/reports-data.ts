// /results redesign: the data computation behind the Overview / By link / By
// salesperson / Ads & campaigns tabs, plus the header stats and the
// plain-words summary sentence. One consistent time system for the whole
// page (Today / 7 days / 30 days / Custom range, all bucketed in `tz`) -
// replacing the old split between app/performance (rolling windows) and
// app/reports (calendar week/month periods). Numbers/grouping rules are
// unchanged from that earlier code; only the period system and the
// presentation shape are new. Shared by /results and app/api/reports/export
// (CSV, which reads lib/reports.ts directly for the period/link-filter
// helpers - this file's getResultsPageData is page-only).
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getAssetDirectory } from "@/lib/performance";
import { salespersonName } from "@/lib/salesperson-names";
import { PLAN_DISPLAY_NAME, normalizePlanKey, reportsTier, audienceAvailable, type ReportsTier } from "@/lib/plan-limits";
import { summarizeAudience, periodEndsBeforeAudienceTracking, type AudienceSummary } from "@/lib/audience";
import {
  dayKeyInTz,
  parseDateParam,
  resolveResultsSelection,
  describePeriodText,
  describeCompareText,
  computeChange,
  computeShare,
  pickTop,
  parseLinkFilter,
  linkFilterTypeFromAssetType,
  LINK_FILTER_TYPE_TO_ASSET_TYPE,
  formatLinkFilterValue,
  buildResultsExportQuery,
  buildSummarySentence,
  buildChatSeries,
  isWithinRange,
  CUSTOM_RANGE_MAX_YEARS_BACK,
  type ResultsPeriod,
  type ResultsSelection,
  type LinkFilter,
  type LinkFilterType,
  type Change,
} from "@/lib/reports";

export type ConversationStartRow = {
  assetType: string;
  assetId: string | null;
  assetName: string | null;
  source: string | null;
  campaign: string | null;
  destination: string | null;
  createdAt: Date;
};

export function dayKey(date: Date, tz: string = "UTC") {
  return dayKeyInTz(date, tz);
}

export function dayLabel(key: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00.000Z`));
}

export function sourceCampaignLabel(source: string | null, campaign: string | null) {
  // UTM values are machine-ish ("facebook", "summer_sale"); show them as words.
  const tidy = (value: string) => value.replace(/[_+]+/g, " ").replace(/\s+/g, " ").trim();
  const rawSource = source?.trim();
  const sourceLabel = rawSource ? tidy(rawSource).replace(/^./, (c) => c.toUpperCase()) : "Direct / untagged";
  const campaignLabel = campaign?.trim() ? tidy(campaign) : "";
  return campaignLabel ? `${sourceLabel} · ${campaignLabel}` : sourceLabel;
}

export function groupCount<T>(list: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of list) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export function busiestDay(list: ConversationStartRow[], tz: string = "UTC") {
  const counts = groupCount(list, (item) => dayKey(item.createdAt, tz));
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

export type SourceRow = { label: string; current: number; previous: number; change: Change };
export type LinkRow = {
  id: string;
  name: string;
  typeLabel: string;
  filterType: LinkFilterType;
  current: number;
  previous: number;
  change: Change;
  share: number;
};
export type SalespersonDestinationRow = {
  destination: string;
  salespersonName: string | null;
  count: number;
  pct: number;
  change: Change;
};
export type SalespersonGroup = { id: string; name: string; curTotal: number; prevTotal: number; destinations: SalespersonDestinationRow[] };
export type LinkOption = { value: string; label: string; typeLabel: string };

export type ResultsPageData =
  | { tier: "none"; planName: string }
  | {
      tier: "basic" | "full";
      planName: string;
      workspaceName: string;
      selection: ResultsSelection;
      periodText: string;
      compareText: string | null;
      linkFilter: LinkFilter | null;
      // FEAT-AUDIENCE: only populated on tier "full" plans (audienceAvailable
      // in lib/plan-limits.ts) - Solo's locked card needs no real data.
      audience: AudienceSummary | null;
      audiencePeriodBeforeTracking: boolean;
      linkOptions: LinkOption[];
      todayInputValue: string;
      earliestCustomDate: string;
      exportQuery: string;

      clicksCurrent: number;
      clicksChange: Change | null;
      busiestLink: { id: string; filterType: LinkFilterType; name: string; typeLabel: string; clicks: number } | null;
      topSalesperson: { name: string; clicks: number } | null;
      topSourceLabel: string | null;
      summarySentence: string;

      chatSeries: ReturnType<typeof buildChatSeries>;
      maxChatSeries: number;

      sourceRows: SourceRow[];
      linkRows: LinkRow[];
      salespersonGroups: SalespersonGroup[];

      isEmpty: boolean;
    };

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fetches and computes everything /results needs for the Overview / By link
 * / By salesperson / Ads & campaigns tabs, plus the always-visible
 * header (period controls, 3 stat cards, summary sentence). `tz` buckets
 * every day/period boundary (UTC unless a tz cookie was supplied).
 */
export async function getResultsPageData(
  userId: string,
  plan: string,
  params: { period?: string; from?: string; to?: string; compare?: string; link?: string },
  tz: string = "UTC",
  now: Date = new Date()
): Promise<ResultsPageData> {
  const tier: ReportsTier = reportsTier(plan);
  const planName = PLAN_DISPLAY_NAME[normalizePlanKey(plan)];

  if (tier === "none") return { tier, planName };

  const membership = await getActiveWorkspace(userId);
  const workspace = membership.workspace as { name: string; ownerId: string } | undefined;
  if (!workspace) redirect("/dashboard");

  const selection = resolveResultsSelection(tier, params, now, tz);
  const { current, previous } = selection;
  const linkFilter = parseLinkFilter(params.link);
  const filterAssetType = linkFilter ? LINK_FILTER_TYPE_TO_ASSET_TYPE[linkFilter.type] : null;

  const [{ index: assetIndex }, starts] = await Promise.all([
    getAssetDirectory(workspace.ownerId),
    prisma.conversationStart.findMany({
      where: {
        workspaceId: membership.workspaceId,
        createdAt: { gte: previous.start, lt: current.end },
        ...(linkFilter ? { assetId: linkFilter.id, assetType: filterAssetType! } : {}),
      },
      select: {
        assetType: true,
        assetId: true,
        assetName: true,
        source: true,
        campaign: true,
        destination: true,
        createdAt: true,
        device: true,
        os: true,
        country: true,
        city: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const currentStarts = starts.filter((item) => isWithinRange(item.createdAt, current));
  const previousStarts = selection.canCompare ? starts.filter((item) => isWithinRange(item.createdAt, previous)) : [];

  const clicksCurrent = currentStarts.length;
  const clicksChange = selection.canCompare ? computeChange(clicksCurrent, previousStarts.length) : null;

  // Link metadata for the "All links" dropdown, the By-link table and the
  // busiest-link stat: starts from every link the user owns (so zero-click
  // links still show up in the dropdown), then widens with any assetId seen
  // on a ConversationStart row whose asset has since been deleted.
  const linkMeta = new Map<string, { name: string; typeLabel: string; filterType: LinkFilterType }>();
  const linkOptions: LinkOption[] = [];
  for (const [id, entry] of assetIndex) {
    const filterType = linkFilterTypeFromAssetType(entry.type);
    if (!filterType) continue;
    linkMeta.set(id, { name: entry.name, typeLabel: entry.typeLabel, filterType });
    linkOptions.push({ value: formatLinkFilterValue(filterType, id), label: entry.name, typeLabel: entry.typeLabel });
  }
  for (const item of starts) {
    if (item.assetId && !linkMeta.has(item.assetId)) {
      const filterType = linkFilterTypeFromAssetType(item.assetType) ?? "shortlink";
      linkMeta.set(item.assetId, {
        name: item.assetName?.trim() || item.assetType.replaceAll("_", " "),
        typeLabel: item.assetType.replaceAll("_", " "),
        filterType,
      });
    }
  }
  linkOptions.sort((a, b) => a.label.localeCompare(b.label));

  // Only ad links record a real source/campaign (the one the customer set on
  // the link). Rotators and WhatsApp links store a fixed "Wazap ..." label,
  // so they are left out rather than shown as a fake source.
  const isAdClick = (item: { assetType: string }) => item.assetType === "ad_link";
  const currentBySource = groupCount(currentStarts.filter(isAdClick), (item) => sourceCampaignLabel(item.source, item.campaign));
  const previousBySource = groupCount(previousStarts.filter(isAdClick), (item) => sourceCampaignLabel(item.source, item.campaign));
  const sourceLabels = new Set([...currentBySource.keys(), ...previousBySource.keys()]);
  const sourceRows: SourceRow[] = [...sourceLabels]
    .map((label) => {
      const current = currentBySource.get(label) ?? 0;
      const previous = previousBySource.get(label) ?? 0;
      return { label, current, previous, change: computeChange(current, previous) };
    })
    .sort((a, b) => b.current - a.current)
    .slice(0, 10);
  const topSourceRow = currentStarts.length ? pickTop(sourceRows, (row) => row.current) : null;
  const topSourceLabel = tier === "full" && topSourceRow && topSourceRow.current > 0 ? topSourceRow.label : null;

  const currentByAsset = groupCount(currentStarts.filter((item) => item.assetId), (item) => item.assetId as string);
  const previousByAsset = groupCount(previousStarts.filter((item) => item.assetId), (item) => item.assetId as string);
  const linkRows: LinkRow[] = [...linkMeta.entries()]
    .map(([id, meta]) => {
      const current = currentByAsset.get(id) ?? 0;
      const previous = previousByAsset.get(id) ?? 0;
      return { id, ...meta, current, previous, change: computeChange(current, previous), share: computeShare(current, clicksCurrent) };
    })
    .sort((a, b) => b.current - a.current);
  const busiestLinkRow = !linkFilter && clicksCurrent > 0 ? pickTop(linkRows, (row) => row.current) : null;
  const busiestLink = busiestLinkRow && busiestLinkRow.current > 0
    ? { id: busiestLinkRow.id, filterType: busiestLinkRow.filterType, name: busiestLinkRow.name, typeLabel: busiestLinkRow.typeLabel, clicks: busiestLinkRow.current }
    : null;

  const rotatorIds = new Set(
    [...currentStarts, ...previousStarts].filter((item) => item.assetType === "rotator" && item.assetId).map((item) => item.assetId as string)
  );
  const salespersonGroups: SalespersonGroup[] = [...rotatorIds]
    .map((id) => {
      const name = linkMeta.get(id)?.name ?? "Lead rotator";
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
            pct: computeShare(count, curTotal),
            change: computeChange(count, prevCount),
          };
        })
        .sort((a, b) => b.count - a.count);
      return { id, name, curTotal, prevTotal, destinations };
    })
    .filter((group) => group.curTotal > 0 || (selection.canCompare && group.prevTotal > 0))
    .sort((a, b) => b.curTotal - a.curTotal);

  const allDestinations = salespersonGroups.flatMap((group) => group.destinations.map((d) => ({ ...d, rotatorName: group.name })));
  const topDestination = pickTop(allDestinations, (row) => row.count);
  const topSalesperson = topDestination && topDestination.count > 0
    ? { name: topDestination.salespersonName || `+${topDestination.destination}`, clicks: topDestination.count }
    : null;

  const dayCountsMap = groupCount(currentStarts, (item) => dayKey(item.createdAt, tz));
  const chatSeries = buildChatSeries(dayCountsMap, current, tz);
  const maxChatSeries = Math.max(1, ...chatSeries.map((point) => point.count));

  const isEmpty = currentStarts.length === 0;

  // FEAT-AUDIENCE: Solo (tier "basic") shows a locked card with no real
  // data, so skip the aggregation entirely there - audienceAvailable mirrors
  // tier === "full" exactly (both pro and ultimate), kept as its own check
  // since it's a plan-gated feature, not a reports-tier one.
  // Rows with device === null predate the feature (prisma/audience_tracking_
  // 20261021.sql) and are excluded rather than counted as "Unknown" - the
  // footnote on the card explains why older clicks don't show up here.
  const audience = audienceAvailable(plan) ? summarizeAudience(currentStarts.filter((item) => item.device !== null)) : null;
  // Whether the selected period ends entirely before tracking started, in
  // which case the card should explain that rather than say "no clicks yet".
  const audiencePeriodBeforeTracking = periodEndsBeforeAudienceTracking(current.end, tz, now);

  const periodText = describePeriodText(selection);
  const compareText = describeCompareText(selection);
  const summarySentence = buildSummarySentence({
    periodText,
    compareText,
    clicks: clicksCurrent,
    change: clicksChange,
    topSourceLabel,
    topSalespersonName: topSalesperson?.name ?? null,
  });

  // Both bound the date-input `max`/`min` for the Custom range form - computed
  // in `tz` (not UTC) so "today" matches what resolveResultsSelection itself
  // treats as today for this visitor (e.g. just after local midnight in a
  // zone ahead of UTC, when the UTC date is still yesterday).
  const todayInputValue = dayKeyInTz(now, tz);
  const earliestDate = parseDateParam(todayInputValue)!;
  earliestDate.setUTCFullYear(earliestDate.getUTCFullYear() - CUSTOM_RANGE_MAX_YEARS_BACK);
  const earliestCustomDate = toDateInputValue(earliestDate);
  const exportQuery = buildResultsExportQuery(selection, params.link ?? null);

  return {
    tier,
    planName,
    workspaceName: workspace.name,
    selection,
    periodText,
    compareText,
    linkFilter,
    audience,
    audiencePeriodBeforeTracking,
    linkOptions,
    todayInputValue,
    earliestCustomDate,
    exportQuery,
    clicksCurrent,
    clicksChange,
    busiestLink,
    topSalesperson,
    topSourceLabel,
    summarySentence,
    chatSeries,
    maxChatSeries,
    sourceRows,
    linkRows,
    salespersonGroups,
    isEmpty,
  };
}

export type { ResultsPeriod };
