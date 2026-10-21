// Pure date/time display helpers shared by the admin Customers list and
// Payments page (app/admin/crm/customers, app/admin/crm/billing). Kept
// dependency-free (no prisma) so they can be unit tested directly - same
// convention as lib/admin-dashboard.ts / lib/admin-reports.ts.

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "13 Nov 2026" - the admin screens' standard long date, never 13/11/2026. */
export function formatAdminDate(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "2 Oct" - no year, for a recent date shown inline (e.g. "ended 2 Oct"). */
export function formatShortDate(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * "3 days ago" / "Today" / "Yesterday" / "Never" for a last-activity style
 * timestamp. A null/invalid input (nothing on record) is always "Never" -
 * never "0 days ago" or an empty string.
 */
export function relativeTime(value: Date | string | null | undefined, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "Never";
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return formatAdminDate(date);

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatAdminDate(date);
}
