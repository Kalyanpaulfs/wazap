import Link from "next/link";

/**
 * Small badge for dashboard lists: shown on an item the billing system paused
 * automatically because it is over the current plan's limit (lib/plan-limit-sync.ts).
 * Links to /pricing so the owner can upgrade to turn it back on.
 * Purely presentational — render it only when the item's `planPausedAt` is set.
 */
export default function PlanPausedBadge({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/pricing"
      title="Paused automatically — over your plan's limit. Upgrade to turn it back on."
      className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-400/20 ${className}`}
    >
      Paused – plan limit
    </Link>
  );
}
