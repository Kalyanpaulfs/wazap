import { Check, X } from "lucide-react";
import {
  PLAN_DISPLAY_NAME,
  linkLimit,
  numbersPerRotatorLimit,
  adLinksAvailable,
  widgetAvailable,
  supportLabel,
  type PlanKey,
} from "@/lib/plan-limits";

// UX-1 step 5 ("Plan & billing" merge): the ✓/✗ comparison the owner asked
// for on /billing, and mirrored in wording on the public /pricing page
// (app/pricing/PricingPlans.tsx `features`). Numbers come from
// lib/plan-limits.ts so the two can never drift apart from the real limits -
// only the Reports row's exact phrasing ("Full + shared exports" for Agency)
// is owner-specified copy with no boolean flag behind it.
const PLAN_COLUMNS: PlanKey[] = ["basic", "pro", "ultimate"];

const REPORTS_ROW: Record<PlanKey, string> = {
  free: "—",
  basic: "Basic (30 days)",
  pro: "Full",
  ultimate: "Full + shared exports",
};

type Cell = boolean | string;

function row(label: string, cells: [Cell, Cell, Cell]) {
  return { label, cells };
}

export default function PlanComparisonTable() {
  const rows = [
    row("Links (any type)", PLAN_COLUMNS.map((key) => String(linkLimit(key))) as [Cell, Cell, Cell]),
    row("Salespeople per lead rotator", PLAN_COLUMNS.map((key) => String(numbersPerRotatorLimit(key))) as [Cell, Cell, Cell]),
    row("Lead rotator", [true, true, true]),
    row("WhatsApp link", [true, true, true]),
    row("Brand link", [true, true, true]),
    row("Ad link", PLAN_COLUMNS.map((key) => adLinksAvailable(key)) as [Cell, Cell, Cell]),
    row("Website button", PLAN_COLUMNS.map((key) => widgetAvailable(key)) as [Cell, Cell, Cell]),
    row("WhatsApp QR code", [true, true, true]),
    row("Unlimited routed leads", [true, true, true]),
    row("Reports", PLAN_COLUMNS.map((key) => REPORTS_ROW[key]) as [Cell, Cell, Cell]),
    row("Support", PLAN_COLUMNS.map((key) => supportLabel(key)) as [Cell, Cell, Cell]),
  ];

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#111811] p-5 sm:p-6" aria-label="Plan comparison">
      <h2 className="text-lg font-semibold text-white">Compare plans</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Feature</th>
              {PLAN_COLUMNS.map((key) => (
                <th key={key} className="px-3 py-2 text-center">{PLAN_DISPLAY_NAME[key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, cells }) => (
              <tr key={label} className="border-b border-slate-900 last:border-0">
                <td className="py-2.5 pr-4 text-slate-300">{label}</td>
                {cells.map((cell, i) => (
                  <td key={i} className="px-3 py-2.5 text-center">
                    {typeof cell === "boolean" ? (
                      cell ? (
                        <Check className="mx-auto h-4 w-4 text-[#25D366]" aria-label="Included" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-slate-600" aria-label="Not included" />
                      )
                    ) : (
                      <span className="text-slate-200">{cell}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
