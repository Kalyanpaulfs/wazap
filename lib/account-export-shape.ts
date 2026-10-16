// Pure helpers for shaping the GDPR account export (lib/account-lifecycle.ts
// buildAccountExport). Kept separate and dependency-free so the "is this
// bucket actually empty" decision is easy to unit test on its own, without a
// database.
//
// "Empty" here means: null/undefined, an array with no items, or a plain
// object whose own values are all themselves empty (checked recursively).
// Dates and primitives (strings/numbers/booleans) are never empty — their
// mere presence counts as data. Arrays are not inspected item-by-item: a
// non-empty array always counts as present, even if its entries happen to be
// sparse objects.
export function isEmptyExportValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value instanceof Date) return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isEmptyExportValue);
  }
  return false;
}

// Returns a shallow copy of `container` with any key whose value is "empty"
// (per isEmptyExportValue) removed. Used so a reorganized export bucket like
// `olderFeatures` only lists the sub-keys that actually hold data for this
// account, instead of a wall of empty arrays for every retired feature.
export function omitEmptyExportKeys<T extends Record<string, unknown>>(container: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(container) as (keyof T)[]) {
    const value = container[key];
    if (!isEmptyExportValue(value)) result[key] = value;
  }
  return result;
}
