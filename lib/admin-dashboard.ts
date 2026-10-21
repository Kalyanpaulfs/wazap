// Pure helpers for the admin Dashboard (/admin/crm/overview, Dashboard.tsx).
// Kept dependency-free (no prisma, no "server-only" imports) so they can be
// unit tested directly - same convention as lib/reports.ts / lib/reports-data.ts.
// Dashboard.tsx does the actual prisma + backupRestoreStatus() queries and
// feeds the resulting counts through these.

export type NeedsAttentionKey = "support" | "forms" | "billing" | "emails" | "backup";
export type NeedsAttentionCounts = Partial<Record<NeedsAttentionKey, number>>;
export type NeedsAttentionItem = { key: NeedsAttentionKey; text: string; count: number; href: string };

// Fixed priority order: support tickets, then contact forms, then billing,
// then the two system-health checks.
const NEEDS_ATTENTION_DEFS: { key: NeedsAttentionKey; href: string; text: (n: number) => string }[] = [
  { key: "support", href: "/admin/crm/support", text: (n) => `${n} support ticket${n === 1 ? "" : "s"} overdue, urgent or waiting for a reply` },
  { key: "forms", href: "/admin/crm/support", text: (n) => `${n} unread website contact form${n === 1 ? "" : "s"}` },
  { key: "billing", href: "/admin/crm/billing", text: (n) => `${n} billing alert${n === 1 ? "" : "s"} unresolved` },
  { key: "emails", href: "/admin/crm/health", text: (n) => `${n} email${n === 1 ? "" : "s"} failed to send in the last 24 hours` },
  { key: "backup", href: "/admin/crm/health", text: () => "Backup check needs attention" },
];

/** Non-zero counts only, in the fixed order above. Pure function over the counts the page already fetched. */
export function buildNeedsAttention(counts: NeedsAttentionCounts): NeedsAttentionItem[] {
  return NEEDS_ATTENTION_DEFS.filter((d) => (counts[d.key] || 0) > 0).map((d) => {
    const count = counts[d.key] || 0;
    return { key: d.key, href: d.href, count, text: d.text(count) };
  });
}

/**
 * "$120 · €40" style summary - amounts in different currencies are shown
 * side by side and never added together. Empty / all-zero -> "—".
 */
export function formatIncomeByCurrency(income: Record<string, number>): string {
  const entries = Object.entries(income).filter(([, amount]) => amount);
  if (!entries.length) return "—";
  return entries.map(([currency, amount]) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)).join(" · ");
}
