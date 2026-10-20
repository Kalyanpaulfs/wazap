// UX-1 step 2 ("My links"): merges RotatorLink/ShortLink/AdLink into one list
// for app/links. Kept separate from lib/link-pool.ts (which is about pool
// counting/create-checks) - this file is about DISPLAYING the pool: merging,
// sorting, addresses and the plan-paused reason shown per row.
import { prisma } from "./prisma";
import { linkLimit, adLinksAvailable, nextPlanPoolHint, normalizePlanKey } from "./plan-limits";
import { countLiveLinks, type LinkKind } from "./link-pool";
import { createdTypeFromKind } from "./link-create-forms";

export type { LinkKind };

// Customer-facing name for each link kind - use EXACTLY these everywhere a
// customer sees them (owner rule). UX-1 step 4: a ShortLink is shown to
// customers as "WhatsApp link" everywhere (My links badge + filter tab,
// details page, Performance/Reports via renameLinkTypeLabel below) - the
// "Brand link" wording survives only as the create-page card for choosing a
// custom address (same ShortLink model either way).
export const LINK_KIND_NAME: Record<LinkKind, string> = {
  rotator: "Lead rotator",
  shortlink: "WhatsApp link",
  adlink: "Ad link",
};

/** Where a My links row's "Edit"/row name sends you: /links/<type>/<id> (UX-1 step 4). */
export function linkDetailsHref(kind: LinkKind, id: string): string {
  return `/links/${createdTypeFromKind(kind)}/${id}`;
}

// ?type= query value <-> LinkKind, for the filter tabs.
export const LINK_FILTER_PARAM: Record<LinkKind, string> = {
  rotator: "rotator",
  shortlink: "shortlink",
  adlink: "adlink",
};

export function linkKindFromFilterParam(value: string | undefined): LinkKind | null {
  const match = (Object.entries(LINK_FILTER_PARAM) as [LinkKind, string][]).find(([, param]) => param === value);
  return match ? match[0] : null;
}

/** Strips the protocol off an origin, e.g. "https://wazap.lt" -> "wazap.lt". */
export function stripProtocol(origin: string): string {
  return origin.replace(/^https?:\/\//, "");
}

export function originBase(): string {
  return new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

/** Full public URL for a link, given its kind and identifying fields. */
export function buildPublicUrl(
  origin: string,
  kind: LinkKind,
  args: { code?: string; id?: string; number?: string; message?: string | null },
): string {
  if (kind === "rotator") return `${origin}/r/${args.code}`;
  if (kind === "shortlink") return `${origin}/w/${args.code}`;
  // Ad links: the public URL embeds the wa.me destination as ?to=, exactly
  // as app/tools/ad-builder/page.tsx buildUrl() builds it.
  const base = args.message
    ? `https://wa.me/${args.number}?text=${encodeURIComponent(args.message)}`
    : `https://wa.me/${args.number}`;
  return `${origin}/a/${args.id}?to=${encodeURIComponent(base)}`;
}

/** Short display address, e.g. "wazap.lt/w/acme" - no query string. */
export function addressDisplay(origin: string, kind: LinkKind, codeOrId: string): string {
  const host = stripProtocol(origin);
  const path = kind === "rotator" ? "r" : kind === "shortlink" ? "w" : "a";
  return `${host}/${path}/${codeOrId}`;
}

// Normalizes either casing used across the app ("Rotator"/"Short link"/"Ad
// link" from lib/performance.ts TYPE_LABELS, or the lowercase "rotator"/
// "short link"/"ad link" from app/reports/page.tsx) into the new
// customer-facing names, without touching the shared lib/performance.ts
// constant itself (other, out-of-scope pages read it too).
export function renameLinkTypeLabel(label: string): string {
  const key = label.toLowerCase().replace(/_/g, " ").trim();
  if (key === "rotator") return "Lead rotator";
  if (key === "short link" || key === "shortlink") return "WhatsApp link";
  if (key === "ad link" || key === "adlink") return "Ad link";
  return label;
}

export type PauseReason = "trial ended" | "over your plan limit" | "ad links need Growth";

/**
 * Best-effort reason a link is currently plan-paused, derived from the
 * user's CURRENT plan (there's no stored reason on the row itself).
 * - no plan at all (free/no active trial): "trial ended"
 * - an ad link on a plan that doesn't offer them: "ad links need Growth"
 * - otherwise: a pool that shrank under an existing count: "over your plan limit"
 */
export function derivePauseReason(kind: LinkKind, plan: string): PauseReason {
  if (normalizePlanKey(plan) === "free") return "trial ended";
  if (kind === "adlink" && !adLinksAvailable(plan)) return "ad links need Growth";
  return "over your plan limit";
}

export function statusLabel(paused: boolean, kind: LinkKind, plan: string): string {
  if (!paused) return "Live";
  return `Paused: ${derivePauseReason(kind, plan)}`;
}

/**
 * True when the owner's CURRENT plan/trial can't route this link kind at
 * all - a lapsed trial/plan (every kind), or a plan that never offered ad
 * links. This is a live read of `plan` (lib/router-entitlements.ts
 * linkPlan), not the stored planPausedAt flag a cron sets - so My links can
 * show "Paused" the instant a trial/plan lapses, before that cron next
 * runs, the same way app/r, app/w and app/a already decide live at click
 * time (canRouteLinks / adLinksAvailable). It deliberately does NOT cover
 * "this plan's pool shrank and this link lost the ranking" - only the
 * pause-sync cron decides which specific links lose that ranking.
 */
export function planCannotRouteKind(kind: LinkKind, plan: string): boolean {
  if (normalizePlanKey(plan) === "free") return true;
  if (kind === "adlink" && !adLinksAvailable(plan)) return true;
  return false;
}

// Manual pause (owner feature request): the customer pauses/resumes their
// own link independent of planPausedAt (lib/plan-limit-sync.ts never reads
// or writes this - see RotatorLink.pausedAt in prisma/schema.prisma). When
// BOTH are set, the plan-pause reason wins in the label - a customer who
// paused a link that was already over their plan limit should still see
// WHY it's really off. `pausedAt` on its own (not plan-paused) shows the
// distinct "⏸ Paused by you" status everywhere a customer sees it.
export function combinedStatusText(planPausedAt: unknown, pausedAt: unknown, kind: LinkKind, plan: string): string {
  if (planPausedAt || planCannotRouteKind(kind, plan)) return statusLabel(true, kind, plan);
  if (pausedAt) return "⏸ Paused by you";
  return "Live";
}

export function formatUsageLine(planLabel: string, used: number, limit: number): string {
  return `${planLabel} plan · ${used} of ${limit} links used`;
}

/** Message shown on the "create link" chooser when the pool is full or the plan has no room at all. */
export function poolFullMessage(plan: string, used: number, limit: number): string {
  if (limit === 0) return `${used} of ${limit} links used · Choose a plan to turn your links back on.`;
  const next = nextPlanPoolHint(plan);
  return next ? `${used} of ${limit} links used · Upgrade to ${next}.` : `${used} of ${limit} links used.`;
}

export type MyLinkRow = {
  id: string;
  kind: LinkKind;
  name: string;
  createdAt: Date;
  addressDisplay: string;
  publicUrl: string;
  metric: number;
  // true when the link isn't live for ANY reason (plan pause or the
  // customer's own manual pause) - drives the amber badge vs "● Live".
  paused: boolean;
  // true only when the CUSTOMER paused it themselves (pausedAt set),
  // independent of planPausedAt - drives the Pause/Resume button's label.
  manuallyPaused: boolean;
  statusText: string;
  editHref: string;
};

type RotatorRow = { id: string; name: string; code: string; totalClicks: number; planPausedAt: Date | null; pausedAt?: Date | null; createdAt: Date };
type ShortLinkRow = { id: string; name: string; code: string; clicks: number; planPausedAt: Date | null; pausedAt?: Date | null; createdAt: Date };
type AdLinkRow = { id: string; name: string; number: string; message: string | null; clicks: number; planPausedAt: Date | null; pausedAt?: Date | null; createdAt: Date };

/**
 * Merges the three link models into one list, newest first. `metric` is the
 * same "total chats" number app/performance uses per type (rotator:
 * totalClicks, short/ad link: clicks) - a click on any of these opens a
 * WhatsApp chat, so Performance already treats it as the chat count.
 */
export function mergeLinks(
  rotators: RotatorRow[],
  shortLinks: ShortLinkRow[],
  adLinks: AdLinkRow[],
  opts: { plan: string; origin: string },
): MyLinkRow[] {
  const { plan, origin } = opts;
  const rows: MyLinkRow[] = [
    ...rotators.map((r) => ({
      id: r.id,
      kind: "rotator" as const,
      name: r.name,
      createdAt: r.createdAt,
      addressDisplay: addressDisplay(origin, "rotator", r.code),
      publicUrl: buildPublicUrl(origin, "rotator", { code: r.code }),
      metric: r.totalClicks,
      paused: Boolean(r.planPausedAt) || Boolean(r.pausedAt) || planCannotRouteKind("rotator", plan),
      manuallyPaused: Boolean(r.pausedAt),
      statusText: combinedStatusText(r.planPausedAt, r.pausedAt, "rotator", plan),
      editHref: linkDetailsHref("rotator", r.id),
    })),
    ...shortLinks.map((s) => ({
      id: s.id,
      kind: "shortlink" as const,
      name: s.name,
      createdAt: s.createdAt,
      addressDisplay: addressDisplay(origin, "shortlink", s.code),
      publicUrl: buildPublicUrl(origin, "shortlink", { code: s.code }),
      metric: s.clicks,
      paused: Boolean(s.planPausedAt) || Boolean(s.pausedAt) || planCannotRouteKind("shortlink", plan),
      manuallyPaused: Boolean(s.pausedAt),
      statusText: combinedStatusText(s.planPausedAt, s.pausedAt, "shortlink", plan),
      editHref: linkDetailsHref("shortlink", s.id),
    })),
    ...adLinks.map((a) => ({
      id: a.id,
      kind: "adlink" as const,
      name: a.name,
      createdAt: a.createdAt,
      addressDisplay: addressDisplay(origin, "adlink", a.id),
      publicUrl: buildPublicUrl(origin, "adlink", { id: a.id, number: a.number, message: a.message }),
      metric: a.clicks,
      paused: Boolean(a.planPausedAt) || Boolean(a.pausedAt) || planCannotRouteKind("adlink", plan),
      manuallyPaused: Boolean(a.pausedAt),
      statusText: combinedStatusText(a.planPausedAt, a.pausedAt, "adlink", plan),
      editHref: linkDetailsHref("adlink", a.id),
    })),
  ];
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function filterLinks(rows: MyLinkRow[], opts: { kind?: LinkKind | null; q?: string }): MyLinkRow[] {
  let result = rows;
  if (opts.kind) result = result.filter((row) => row.kind === opts.kind);
  const q = opts.q?.trim().toLowerCase();
  if (q) result = result.filter((row) => row.name.toLowerCase().includes(q));
  return result;
}

export type MyLinksData = {
  rows: MyLinkRow[];
  plan: string;
  planLabel: string;
  used: number;
  limit: number;
};

/** Fetches and merges a user's rotators/short links/ad links for app/links. */
export async function getMyLinks(userId: string, plan: string): Promise<Omit<MyLinksData, "plan" | "planLabel">> {
  const origin = originBase();
  const [rotators, shortLinks, adLinks, used] = await Promise.all([
    prisma.rotatorLink.findMany({
      where: { userId },
      select: { id: true, name: true, code: true, totalClicks: true, planPausedAt: true, pausedAt: true, createdAt: true },
    }),
    prisma.shortLink.findMany({
      where: { userId },
      select: { id: true, name: true, code: true, clicks: true, planPausedAt: true, pausedAt: true, createdAt: true },
    }),
    prisma.adLink.findMany({
      where: { userId },
      select: { id: true, name: true, number: true, message: true, clicks: true, planPausedAt: true, pausedAt: true, createdAt: true },
    }),
    // Same count the create APIs use (lib/link-pool.ts) - kept identical so
    // the usage line here never disagrees with what blocks creation.
    countLiveLinks(userId),
  ]);
  const rows = mergeLinks(rotators, shortLinks, adLinks, { plan, origin });
  const limit = linkLimit(plan);
  return { rows, used, limit };
}
