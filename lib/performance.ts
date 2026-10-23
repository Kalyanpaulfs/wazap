import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;
export const TRACKED_ASSET_TYPES = ["rotator", "short_link", "ad_link"] as const;
export type TrackedAssetType = (typeof TRACKED_ASSET_TYPES)[number];

export const TYPE_LABELS: Record<TrackedAssetType, string> = {
  rotator: "Rotator",
  short_link: "Short link",
  ad_link: "Ad link",
};

function originBase() {
  return new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export type PerformanceLink = {
  id: string;
  type: TrackedAssetType;
  typeLabel: string;
  name: string;
  publicUrl: string;
  chats30d: number;
  totalChats: number;
  paused: boolean;
  /** ISO timestamp of the newest ConversationStart for this link within the
   * 30-day window already loaded, or null if there were none. */
  lastChatAt: string | null;
};

export type PerformanceSnapshot = {
  totals: {
    linksLive: number;
    rotators: number;
    shortLinks: number;
    adLinks: number;
    chatsToday: number;
    chats7d: number;
    chats30d: number;
  };
  daily: { date: string; label: string; count: number }[];
  perLink: PerformanceLink[];
};

export type AssetDirectoryEntry = {
  type: TrackedAssetType;
  typeLabel: string;
  name: string;
  publicUrl: string;
  /** Rotator only: the raw numberNames JSON (digits-number -> name). Look up
   * with lib/salesperson-names.ts's salespersonName(), which tolerates
   * non-object/invalid values. */
  numberNames?: unknown;
  /** Rotator only: digits-only numbers the owner paused individually (see
   * RotatorLink.pausedNumbers / lib/rotator-routing.ts). */
  pausedNumbers?: string[];
};

/**
 * Looks up the rotators, short links and ad links owned by `ownerId`, plus a
 * lookup index from asset id to its display name, type and public URL. Reused
 * by both the Performance snapshot and the Reports page so the mapping from a
 * ConversationStart.assetId to a link stays in one place.
 */
export async function getAssetDirectory(ownerId: string) {
  const [rotators, shortLinks, adLinks] = await Promise.all([
    prisma.rotatorLink.findMany({
      where: { userId: ownerId },
      select: { id: true, name: true, code: true, numbers: true, numberNames: true, pausedNumbers: true, totalClicks: true, planPausedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.shortLink.findMany({
      where: { userId: ownerId },
      select: { id: true, name: true, code: true, clicks: true, planPausedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.adLink.findMany({
      where: { userId: ownerId },
      select: { id: true, name: true, clicks: true, planPausedAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const base = originBase();
  const index = new Map<string, AssetDirectoryEntry>();
  for (const r of rotators) index.set(r.id, { type: "rotator", typeLabel: TYPE_LABELS.rotator, name: r.name, publicUrl: `${base}/r/${r.code}`, numberNames: r.numberNames, pausedNumbers: r.pausedNumbers });
  for (const s of shortLinks) index.set(s.id, { type: "short_link", typeLabel: TYPE_LABELS.short_link, name: s.name, publicUrl: `${base}/w/${s.code}` });
  for (const a of adLinks) index.set(a.id, { type: "ad_link", typeLabel: TYPE_LABELS.ad_link, name: a.name, publicUrl: `${base}/a/${a.id}` });

  return { rotators, shortLinks, adLinks, index };
}

export async function getPerformanceSnapshot(userId: string): Promise<PerformanceSnapshot> {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDay = new Date(todayUTC.getTime() - 29 * DAY);
  const start7Day = new Date(todayUTC.getTime() - 6 * DAY);

  const [{ rotators, shortLinks, adLinks }, starts] = await Promise.all([
    getAssetDirectory(userId),
    prisma.conversationStart.findMany({
      where: { userId, assetType: { in: [...TRACKED_ASSET_TYPES] }, createdAt: { gte: startDay } },
      select: { assetType: true, assetId: true, createdAt: true },
    }),
  ]);

  // Single pass over the 30-day window builds the daily series, the per-link
  // 30-day counts and each link's most recent chat together, avoiding
  // repeated scans or extra queries.
  const dayCounts = new Map<string, number>();
  const linkCounts30d = new Map<string, number>();
  const lastChatAt = new Map<string, Date>();
  for (const start of starts) {
    const key = dayKey(start.createdAt);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    if (start.assetId) {
      linkCounts30d.set(start.assetId, (linkCounts30d.get(start.assetId) ?? 0) + 1);
      const previous = lastChatAt.get(start.assetId);
      if (!previous || start.createdAt > previous) lastChatAt.set(start.assetId, start.createdAt);
    }
  }

  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(startDay.getTime() + index * DAY);
    const key = dayKey(date);
    return { date: key, label: dayLabel(date), count: dayCounts.get(key) ?? 0 };
  });

  const chatsToday = dayCounts.get(dayKey(todayUTC)) ?? 0;
  const chats7d = starts.filter((start) => start.createdAt >= start7Day).length;
  const chats30d = starts.length;

  const base = originBase();
  const perLink: PerformanceLink[] = [
    ...rotators.map((r) => ({
      id: r.id,
      type: "rotator" as const,
      typeLabel: TYPE_LABELS.rotator,
      name: r.name,
      publicUrl: `${base}/r/${r.code}`,
      chats30d: linkCounts30d.get(r.id) ?? 0,
      totalChats: r.totalClicks,
      paused: Boolean(r.planPausedAt),
      lastChatAt: lastChatAt.get(r.id)?.toISOString() ?? null,
    })),
    ...shortLinks.map((s) => ({
      id: s.id,
      type: "short_link" as const,
      typeLabel: TYPE_LABELS.short_link,
      name: s.name,
      publicUrl: `${base}/w/${s.code}`,
      chats30d: linkCounts30d.get(s.id) ?? 0,
      totalChats: s.clicks,
      paused: Boolean(s.planPausedAt),
      lastChatAt: lastChatAt.get(s.id)?.toISOString() ?? null,
    })),
    ...adLinks.map((a) => ({
      id: a.id,
      type: "ad_link" as const,
      typeLabel: TYPE_LABELS.ad_link,
      name: a.name,
      publicUrl: `${base}/a/${a.id}`,
      chats30d: linkCounts30d.get(a.id) ?? 0,
      totalChats: a.clicks,
      paused: Boolean(a.planPausedAt),
      lastChatAt: lastChatAt.get(a.id)?.toISOString() ?? null,
    })),
  ].sort((a, b) => b.chats30d - a.chats30d);

  return {
    totals: {
      linksLive: rotators.length + shortLinks.length + adLinks.length,
      rotators: rotators.length,
      shortLinks: shortLinks.length,
      adLinks: adLinks.length,
      chatsToday,
      chats7d,
      chats30d,
    },
    daily,
    perLink,
  };
}
