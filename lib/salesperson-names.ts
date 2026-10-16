// Pure helpers for the optional salesperson name attached to a rotator's
// WhatsApp number (RotatorLink.numberNames, a JSON map of digits-only number
// -> display name). Kept dependency-free so normalization/lookup rules can
// be unit tested without a database. See app/api/rotator/route.ts for where
// these are applied.

const MAX_NAME_LENGTH = 40;

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}

/**
 * Normalizes an incoming `numberNames` payload (object number -> name) into
 * a safe map: keys are reduced to digits-only, only keys present in
 * `validNumbers` are kept, values are trimmed/collapsed/length-capped, and
 * empty names are dropped entirely. Any non-object input (including
 * null/undefined/arrays/invalid JSON already parsed to a non-object) is
 * treated as {} and normalizes to {}.
 */
export function normalizeNumberNames(
  input: unknown,
  validNumbers: readonly string[]
): Record<string, string> {
  const validSet = new Set(validNumbers.map((n) => onlyDigits(n)));
  const result: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;

  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const digits = onlyDigits(rawKey);
    if (!digits || !validSet.has(digits)) continue;
    const name = cleanName(rawValue);
    if (!name) continue;
    result[digits] = name;
  }
  return result;
}

/**
 * Looks up the display name for a destination number inside a stored
 * `numberNames` value. Tolerates a leading '+' (or other non-digit noise)
 * on the lookup number, and tolerates `names` being anything other than a
 * plain object (e.g. invalid JSON already parsed to a string/array/null) by
 * treating it as {}. Returns null when there is no name on file.
 */
export function salespersonName(names: unknown, number: string): string | null {
  if (!names || typeof names !== "object" || Array.isArray(names)) return null;
  const digits = onlyDigits(number);
  if (!digits) return null;
  const value = (names as Record<string, unknown>)[digits];
  return typeof value === "string" && value.trim() ? value : null;
}
