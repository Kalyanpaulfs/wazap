// UX-1 step 3 (in-app create forms + success screen): pure, DB-free helpers
// shared by app/links/new/{rotator,brand,ad}, app/api/shortlinks/check and
// app/links/created. Kept separate from lib/my-links.ts (displaying the
// pool) and lib/link-pool.ts (create-check) - this file is about VALIDATING
// and SHAPING the data the three in-app forms collect, before it is sent to
// the existing app/api/{rotator,shortlinks,adlinks} POST handlers unchanged.
import type { LinkKind } from "./link-pool";

// ---- Brand link (short link) slug ----------------------------------------
// Must stay byte-for-byte identical to slugOk() in app/api/shortlinks/route.ts
// - that route is the source of truth for what slug is actually accepted;
// this just lets the create form (and the availability check endpoint) apply
// the same rule before/without a round trip that creates anything.
export const BRAND_SLUG_REGEX = /^[a-z0-9-]{3,30}$/;

export function isValidBrandSlug(slug: string): boolean {
  return BRAND_SLUG_REGEX.test(slug);
}

/** Live-typing filter for the brand address input: lowercase, strip anything not a-z/0-9/-. */
export function sanitizeBrandSlugInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
}

// ---- Phone numbers ---------------------------------------------------------
export function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Same floor the APIs use (app/api/rotator and app/api/shortlinks): 8+ digits, country code included. */
export function isValidPhoneDigits(digits: string): boolean {
  return digits.length >= 8;
}

// ---- Lead rotator: salespeople rows ---------------------------------------
export type SalespersonRow = { name: string; number: string };

/** Minimum salespeople a rotator needs - same floor app/tools/rotator/page.tsx has always enforced. */
export const MIN_SALESPEOPLE = 2;

/**
 * Builds the `numbers`/`numberNames` the rotator POST body expects from the
 * form's per-row {name, number} inputs plus the single country-code dial
 * prefix. Rows with a too-short number are dropped. Returns null when fewer
 * than MIN_SALESPEOPLE valid rows remain.
 */
export function buildRotatorNumbers(
  dial: string,
  rows: SalespersonRow[],
): { numbers: string[]; numberNames: Record<string, string> } | null {
  const numbers: string[] = [];
  const numberNames: Record<string, string> = {};
  for (const row of rows) {
    const full = dial + digitsOnly(row.number);
    if (!isValidPhoneDigits(full)) continue;
    numbers.push(full);
    const name = row.name.trim();
    if (name) numberNames[full] = name;
  }
  if (numbers.length < MIN_SALESPEOPLE) return null;
  return { numbers, numberNames };
}

/**
 * The "X of N salespeople (Plan). Need more? NextPlan allows M." counter
 * text under the rotator form's salespeople rows. `nextPlanHint` is
 * nextPlanNumbersHint(plan) from lib/plan-limits.ts - "" on the top plan,
 * which drops the "Need more?" sentence entirely.
 */
export function salespeopleCounterText(count: number, limit: number, planLabel: string, nextPlanHint: string): string {
  const base = `${count} of ${limit} salespeople (${planLabel}).`;
  return nextPlanHint ? `${base} Need more? ${nextPlanHint}.` : base;
}

// ---- Ad link: source presets -> UTM --------------------------------------
// Plain-word chips shown on the ad link form; "Other" reveals a free-text
// input instead. Maps onto the single utmSource field app/api/adlinks
// already accepts - no new API fields.
export const AD_SOURCE_PRESETS = ["Facebook", "Instagram", "Google", "TikTok", "Other"] as const;
export type AdSourcePreset = (typeof AD_SOURCE_PRESETS)[number];

/** utm_source value for a chosen preset ("Other" uses the free-text field instead). */
export function sourceToUtmSource(preset: AdSourcePreset, customSource: string): string {
  if (preset === "Other") return customSource.trim().toLowerCase().slice(0, 60);
  return preset.toLowerCase();
}

// ---- Success screen URL + type mapping ------------------------------------
// The ?type= used on /links/created is a short, URL-friendly word per
// customer-facing tool, distinct from the internal LinkKind used elsewhere
// (lib/link-pool.ts) so the success URL reads "brand"/"ad" rather than the
// DB-ish "shortlink"/"adlink".
export type CreatedLinkType = "rotator" | "brand" | "ad";

const CREATED_TYPE_TO_KIND: Record<CreatedLinkType, LinkKind> = {
  rotator: "rotator",
  brand: "shortlink",
  ad: "adlink",
};
const KIND_TO_CREATED_TYPE: Record<LinkKind, CreatedLinkType> = {
  rotator: "rotator",
  shortlink: "brand",
  adlink: "ad",
};

export function kindFromCreatedType(type: string | undefined | null): LinkKind | null {
  if (type === "rotator" || type === "brand" || type === "ad") return CREATED_TYPE_TO_KIND[type];
  return null;
}

export function createdTypeFromKind(kind: LinkKind): CreatedLinkType {
  return KIND_TO_CREATED_TYPE[kind];
}

export function buildCreatedUrl(type: CreatedLinkType, id: string): string {
  return `/links/created?type=${type}&id=${encodeURIComponent(id)}`;
}
