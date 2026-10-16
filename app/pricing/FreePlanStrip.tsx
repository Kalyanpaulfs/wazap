import Link from "next/link";
import { FREE_ROUTED_LEADS_LIFETIME } from "@/lib/router-entitlements";
import { NUMBERS_PER_ROTATOR_LIMITS, ROTATOR_LIMITS } from "@/lib/plan-limits";

// Shared between /pricing and /plans so the Free plan's facts are written
// once (FEAT-BILLING-PLANS-PAGES). Rendered as the first card in the
// PricingPlans grid so Free sits next to the paid plans.
const FREE_FEATURES = [
  `${ROTATOR_LIMITS.free} WhatsApp rotator link`,
  `Up to ${NUMBERS_PER_ROTATOR_LIMITS.free} numbers per rotator`,
  `${FREE_ROUTED_LEADS_LIFETIME} routed leads (lifetime)`,
  "Round-robin distribution",
  "Link builder & QR maker",
  "Live performance page",
  "Basic support",
];

export default function FreePlanStrip({
  isCurrent = false,
  ctaHref = "/signup?redirect=/tools/rotator",
  ctaLabel = "Route 25 Leads Free",
  note,
}: {
  isCurrent?: boolean;
  ctaHref?: string | null;
  ctaLabel?: string;
  note?: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0 rounded-2xl border border-slate-800 bg-[#111811] p-6 flex flex-col">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-white">Free</h2>
          {isCurrent && (
            <span className="rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-2.5 py-0.5 text-xs font-semibold text-[#25D366]">
              Current plan
            </span>
          )}
        </div>
        <p className="text-slate-500 text-sm mt-1">Try lead routing with one link</p>
        <div className="mt-5 mb-6 flex flex-wrap items-baseline gap-x-2">
          <span className="text-4xl font-bold tracking-tight text-white">$0</span>
          <span className="text-slate-500 text-sm">no card required</span>
        </div>
      </div>

      <ul className="space-y-3 flex-1 mb-8">
        {FREE_FEATURES.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-300">
            <span className="text-[#25D366] mt-0.5 shrink-0">✓</span>
            {feature}
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <p className="rounded-full border border-[#25D366]/40 bg-[#25D366]/10 py-3 text-center text-sm font-semibold text-[#25D366]">Your current plan</p>
      ) : note ? (
        <p className="text-center text-xs text-slate-500">{note}</p>
      ) : ctaHref ? (
        <Link href={ctaHref} className="flex w-full items-center justify-center rounded-full border border-slate-700 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-[#25D366] hover:text-white">
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
