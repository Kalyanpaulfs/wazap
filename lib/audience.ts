// Audience feature (device, OS, country, city of people who click a
// customer's links; Growth/Agency plans only - see lib/plan-limits.ts
// audienceAvailable). Ported from the device/OS regex logic in the
// link-generator product ("D:\My products\link-generator\app\[slug]\route.ts"),
// trimmed to the labels Wazap actually stores. Pure + no `server-only` so
// it stays unit-testable (tests/lib/__tests__/audience.test.ts).
//
// Privacy: this file never sees a raw IP or stores a raw user-agent string
// - it only ever returns the small derived labels below, which is all that
// ends up on the ConversationStart row (see prisma/audience_tracking_20261021.sql).
import { parseDateParam, placeholderToLocalDayStart } from "@/lib/reports";

/** The calendar day (in the visitor's tz) audience tracking went live - see
 * prisma/audience_tracking_20261021.sql. Single source of truth for both the
 * card's footnote and periodEndsBeforeAudienceTracking below. */
export const AUDIENCE_TRACKING_START = "2026-10-21";

export type AudienceDevice = "Desktop" | "Mobile" | "Tablet" | "Bot";
export type AudienceOs =
  | "Windows"
  | "Android"
  | "Mac OS"
  | "iOS"
  | "Chrome OS"
  | "Linux"
  | "KaiOS"
  | "HarmonyOS"
  | "Windows Phone"
  | "Other";

const BOT_RE = /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|slack|twitter|linkedin|preview/i;
const TABLET_RE = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i;
const MOBILE_RE =
  /Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i;

/**
 * Detects device type + OS from a `user-agent` header and, when the browser
 * sends it, the `sec-ch-ua-platform` Client Hint (higher accuracy than the
 * user-agent string alone, and the one checked first - matches the
 * reference implementation). Never throws: an empty/garbage user-agent just
 * falls through to "Desktop" / "Other".
 */
export function detectDevice(
  userAgent: string | null | undefined,
  chPlatform?: string | null
): { device: AudienceDevice; os: AudienceOs; isBot: boolean } {
  const ua = userAgent || "";
  const platform = (chPlatform || "").replace(/["']/g, "").trim().toLowerCase();

  const isBot = BOT_RE.test(ua);

  let device: AudienceDevice = "Desktop";
  if (isBot) {
    device = "Bot";
  } else if (/kaios/i.test(ua)) {
    device = "Mobile";
  } else if (TABLET_RE.test(ua)) {
    device = "Tablet";
  } else if (MOBILE_RE.test(ua)) {
    device = "Mobile";
  }

  let os: AudienceOs = "Other";
  if (!isBot) {
    // High-accuracy Client Hints first (Chrome, Edge, Samsung Internet,
    // modern Android) - checked before falling back to the user-agent string.
    if (platform.includes("android")) os = "Android";
    else if (platform.includes("windows")) os = "Windows";
    else if (platform.includes("macos") || platform.includes("mac os")) os = "Mac OS";
    else if (platform.includes("ios")) os = "iOS";
    else if (platform.includes("cros") || platform.includes("chrome os")) os = "Chrome OS";
    else if (platform.includes("linux")) os = "Linux";

    if (os === "Other") {
      if (/kaios/i.test(ua)) os = "KaiOS";
      else if (/ipad|iphone|ipod/i.test(ua)) os = "iOS";
      else if (/android/i.test(ua)) os = "Android";
      else if (/windows phone/i.test(ua)) os = "Windows Phone";
      else if (/windows nt|win32|win64/i.test(ua)) os = "Windows";
      else if (/macintosh|mac os x/i.test(ua)) os = "Mac OS";
      else if (/cros/i.test(ua)) os = "Chrome OS";
      else if (/harmonyos|openharmony/i.test(ua)) os = "HarmonyOS";
      else if (/linux/i.test(ua)) os = "Linux";
    }
  }

  return { device, os, isBot };
}

// `code` = ISO2 country of the row (countries, and the city's country) for the badge on the card.
export type AudienceRow = { label: string; count: number; pct: number; code?: string };
export type AudienceSummary = {
  devices: AudienceRow[];
  os: AudienceRow[];
  countries: AudienceRow[];
  cities: AudienceRow[];
};

/** One ConversationStart row's worth of audience fields, as stored on the DB row. */
export type AudienceSourceRow = {
  device: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
};

function regionDisplayName(isoCode: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(isoCode) || isoCode;
  } catch {
    return isoCode;
  }
}

type Item = { label: string; code?: string | null };

function summarizeDimension(items: Item[]): AudienceRow[] {
  const counts = new Map<string, { count: number; code?: string }>();
  for (const { label, code } of items) {
    const entry = counts.get(label) || { count: 0, code: code || undefined };
    entry.count += 1;
    counts.set(label, entry);
  }
  const total = items.length;
  return [...counts.entries()]
    .map(([label, { count, code }]) => ({ label, count, pct: total ? Math.round((count / total) * 100) : 0, ...(code ? { code } : {}) }))
    .sort((a, b) => b.count - a.count);
}

const isIso = (code: string | null): code is string => !!code && /^[A-Z]{2}$/.test(code);

/**
 * Aggregates raw ConversationStart rows into the 4 Audience panels (Devices,
 * Operating systems, Countries, Cities). Bot clicks (device "Bot") are
 * excluded entirely - they're real page hits, not visitors. Missing values
 * get friendly labels (never "Unknown") - see the comment inside;
 * country codes are expanded to display names via Intl.DisplayNames,
 * falling back to the raw code if that ever throws.
 */
export function summarizeAudience(rows: AudienceSourceRow[]): AudienceSummary {
  const real = rows.filter((row) => row.device !== "Bot");
  // Owner decision: never show "Unknown". No country = the click came from a
  // private/local address (office network, localhost) or a lookup gap; a
  // missing city falls back to the country ("Elsewhere in India").
  return {
    devices: summarizeDimension(real.map((row) => ({ label: row.device || "Desktop" }))),
    os: summarizeDimension(real.map((row) => ({ label: !row.os || row.os === "Other" ? OTHER_OS_LABEL : row.os }))),
    countries: summarizeDimension(real.map((row) => ({ label: row.country ? regionDisplayName(row.country) : PRIVATE_NETWORK_LABEL, code: isIso(row.country) ? row.country : null }))),
    cities: summarizeDimension(real.map((row) => ({
      label: row.city || (row.country ? `Elsewhere in ${regionDisplayName(row.country)}` : PRIVATE_NETWORK_LABEL),
      code: isIso(row.country) ? row.country : null,
    }))),
  };
}

export const PRIVATE_NETWORK_LABEL = "Private network";
export const OTHER_OS_LABEL = "Private browser";

/**
 * True when the selected period's last day (in `tz`) falls entirely before
 * AUDIENCE_TRACKING_START - i.e. there can be no device/location data for it
 * at all, so the card should explain that rather than say "no clicks yet".
 * `rangeEnd` is a DateRange's exclusive end (lib/reports.ts).
 */
export function periodEndsBeforeAudienceTracking(rangeEnd: Date, tz: string, now: Date = new Date()): boolean {
  const trackingStart = placeholderToLocalDayStart(parseDateParam(AUDIENCE_TRACKING_START)!, tz, now);
  return rangeEnd.getTime() <= trackingStart.getTime();
}
