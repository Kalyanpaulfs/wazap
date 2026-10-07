import Link from "next/link";
import { PLANS, TOOL_LIMITS } from "@/lib/tool-access";

const TOOL_ROWS = [
  ["Consent-Based Bulk Sender", "bulk"],
  ["Lead Follow-Up", "leads"],
  ["Widget Generator", "widget"],
  ["Number Formatter", "checker"],
  ["Ad Link Builder", "adBuilder"],
  ["vCard + QR Pack", "vcard"],
  ["WhatsApp Linktree", "linktree"],
  ["Link Rotator", "rotator"],
  ["Transcript Exporter", "transcript"],
  ["QR Generator", "qr"],
  ["Click-to-Chat Builder", "link"],
  ["Message Templates", "templates"],
  ["Short Links + Analytics", "shortlink"],
  ["Catalog / Order Page", "catalog"],
  ["Text Formatter", "formatter"],
  ["Chat Insights", "chatInsights"],
  ["Customer Reply Generator", "replyGenerator"],
  ["Message Scheduler", "messageScheduler"],
] as const;

const BUSINESS_CAPABILITY_ROWS = [
  { name: "Governed automation rules", values: ["1", "3", "10", "30", "100"] },
  { name: "Verified channel connections", values: ["1", "1", "3", "10", "25"] },
  { name: "Workspace members", values: ["1", "1", "1", "Up to 5", "Up to 25"] },
  { name: "Governed AI employee profiles", values: ["1", "1", "Up to 3", "Up to 10", "Up to 25"] },
  { name: "Routing destinations", values: ["Self-serve", "Self-serve", "Self-serve", "Self-serve", "Up to 25 managed"] },
  { name: "Routing resilience", values: ["Default fallback", "Default fallback", "Default fallback", "Cached + fallback", "Managed fail-open"] },
  { name: "Reporting", values: ["Basic usage", "Basic usage", "Campaign analytics", "Shared outcomes", "Buyer intent + conversion"] },
  { name: "Onboarding", values: ["Self-serve", "Self-serve", "Self-serve", "Self-serve", "Guided setup + migration"] },
  { name: "Support", values: ["Help centre", "Standard", "Standard", "Priority", "Priority response"] },
];

export default function PlanComparison() {
  return (
    <section className="mt-16" aria-labelledby="plan-comparison-heading">
      <h2 id="plan-comparison-heading" className="text-center text-3xl font-bold text-white">Compare every plan</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-400">See tool capacity, collaboration limits, routing resilience, reporting, onboarding, and support before you choose.</p>
      <p className="mx-auto mb-8 mt-4 max-w-2xl rounded-full border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-center text-xs font-medium text-amber-200">Business includes every Team tool, plus managed routing, stronger resilience, advanced reporting, and guided onboarding.</p>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[820px] overflow-hidden rounded-3xl border border-slate-800 bg-[#0d150d]">
          <div className="grid grid-cols-[1.25fr_repeat(5,1fr)] border-b border-slate-800">
            <div className="p-4 text-sm font-semibold text-slate-500">Core tool access</div>
            {PLANS.map((plan) => (
              <div key={plan.name} className={`border-l border-slate-800 p-4 text-center ${plan.highlight ? "bg-[#25D366]/5" : ""}`}>
                <div className="text-sm font-bold text-white">{plan.name}</div>
                <div className={`mt-0.5 text-xs ${plan.highlight ? "text-[#25D366]" : "text-slate-500"}`}>{plan.price === 0 ? "Free" : `$${plan.price}/mo`}</div>
              </div>
            ))}
          </div>

          {TOOL_ROWS.map(([name, accessKey], rowIndex) => (
            <div key={accessKey} className={`grid grid-cols-[1.25fr_repeat(5,1fr)] border-b border-slate-800/50 ${rowIndex % 2 ? "bg-slate-900/20" : ""}`}>
              <div className="p-4 text-sm text-slate-300">{name}</div>
              {PLANS.map((plan) => {
                const limit = TOOL_LIMITS[accessKey][plan.accessKey];
                return <div key={plan.name} className={`border-l border-slate-800/50 p-4 text-center text-xs font-medium ${plan.highlight ? "bg-[#25D366]/5" : ""} ${limit.uses === -1 ? "text-[#25D366]" : "text-slate-300"}`}>{plan.name === "Business" ? "Included" : limit.label}</div>;
              })}
            </div>
          ))}

          <div className="grid grid-cols-[1.25fr_repeat(5,1fr)] border-y border-amber-400/20 bg-amber-400/5">
            <div className="p-4 text-sm font-bold text-amber-200">Team &amp; Business capabilities</div>
            <div className="col-span-5 p-4 text-right text-xs text-amber-200/70">Why Business is different</div>
          </div>
          {BUSINESS_CAPABILITY_ROWS.map((row, rowIndex) => (
            <div key={row.name} className={`grid grid-cols-[1.25fr_repeat(5,1fr)] border-b border-slate-800/50 ${rowIndex % 2 ? "bg-slate-900/20" : ""}`}>
              <div className="p-4 text-sm font-medium text-slate-300">{row.name}</div>
              {row.values.map((value, valueIndex) => <div key={`${row.name}-${valueIndex}`} className={`border-l border-slate-800/50 p-4 text-center text-xs font-medium ${valueIndex === 4 ? "bg-amber-400/5 text-amber-200" : valueIndex === 3 ? "text-violet-300" : "text-slate-400"}`}>{value}</div>)}
            </div>
          ))}

          <div className="grid grid-cols-[1.25fr_repeat(5,1fr)] p-4">
            <div />
            {PLANS.map((plan) => <div key={plan.name} className="px-2 text-center"><Link href={plan.price === 0 ? "/signup" : `/pricing?plan=${plan.name === "Business" ? "business" : plan.accessKey}`} className={`block rounded-full py-2 text-xs font-bold transition-transform hover:scale-105 ${plan.highlight ? "bg-[#25D366] text-black" : "border border-slate-700 text-slate-300"}`}>{plan.price === 0 ? "Start trial" : `Choose ${plan.name}`}</Link></div>)}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">Displayed local prices are estimates. Provider checkout bills the configured USD monthly price.</p>
    </section>
  );
}
