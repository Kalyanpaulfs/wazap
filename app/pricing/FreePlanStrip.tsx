import Link from "next/link";
import { NUMBERS_PER_ROTATOR_LIMITS, ROTATOR_LIMITS, SHORT_LINK_LIMITS } from "@/lib/plan-limits";

// Shared between /pricing and /plans so the Free-trial card's facts are
// written once (FEAT-BILLING-PLANS-PAGES; updated for the 100-lead trial
// cap, FEAT-TRIAL-100-LEADS). This card represents the 3-day Free trial
// every new account gets — EXACTLY Solo's features, plus 100 routed
// leads while the trial lasts. It is never a permanent "Free" plan: there
// is no standing free tier to show here. Rendered as the first card in the
// PricingPlans grid so it sits next to the paid plans.
const FREE_FEATURES = [
  `${ROTATOR_LIMITS.basic} WhatsApp rotator links`,
  `Up to ${NUMBERS_PER_ROTATOR_LIMITS.basic} numbers per rotator`,
  "100 routed leads",
  `${SHORT_LINK_LIMITS.basic} branded short links`,
  "Website widget",
  "Basic reports (last 30 days)",
  "Round-robin distribution",
  "Basic support",
];

export default function FreePlanStrip({
  isCurrent = false,
  trialDaysLeft = null,
  ctaHref = "/signup?redirect=/tools/rotator",
  ctaLabel = "Start 3-day free trial",
  note,
}: {
  isCurrent?: boolean;
  // Set while the user's free trial is running: marks this card as their current plan.
  trialDaysLeft?: number | null;
  ctaHref?: string | null;
  ctaLabel?: string;
  note?: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0 rounded-2xl border border-slate-800 bg-[#111811] p-6 flex flex-col">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-white">Free trial</h2>
          {trialDaysLeft != null && (
            <span className="rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-2.5 py-0.5 text-xs font-semibold text-[#25D366]">
              Current plan · {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left
            </span>
          )}
          {isCurrent && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
              Trial ended
            </span>
          )}
        </div>
        <p className="text-slate-500 text-sm mt-1">3 days, everything in Solo, no card needed</p>
        <div className="mt-5 mb-6 flex flex-wrap items-baseline gap-x-2">
          <span className="text-4xl font-bold tracking-tight text-white">$0</span>
          <span className="text-slate-500 text-sm">for 3 days</span>
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
        <p className="rounded-full border border-amber-400/40 bg-amber-400/10 py-3 text-center text-sm font-semibold text-amber-300">Trial ended — links paused</p>
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
