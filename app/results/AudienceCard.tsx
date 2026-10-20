import Link from "next/link";
import { Cpu, Globe2, Lock, MapPin, Smartphone } from "lucide-react";
import type { AudienceRow, AudienceSummary } from "@/lib/audience";

// "Audience" section on /results (FEAT-AUDIENCE, Growth/Agency only): device,
// OS, country and city of the people who click a customer's links. Follows
// the page's existing selected date range - no separate Lifetime/Plan
// toggle. Styled to match the surrounding results cards (bg-[#111811],
// border-slate-800, #25D366 bars - see the stat cards/tables above in
// app/results/page.tsx).

const PANEL_ICONS = { devices: Smartphone, os: Cpu, countries: Globe2, cities: MapPin } as const;
const PANEL_TITLES = { devices: "Devices", os: "Operating systems", countries: "Countries", cities: "Cities" } as const;

function Panel({ kind, rows }: { kind: keyof typeof PANEL_TITLES; rows: AudienceRow[] }) {
  const Icon = PANEL_ICONS[kind];
  return (
    <article className="flex flex-col rounded-2xl border border-slate-800 bg-[#0d130e] p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#25D366]" />
        <h3 className="text-sm font-semibold text-white">{PANEL_TITLES[kind]}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 flex-1 text-sm text-slate-500">No clicks in this period yet.</p>
      ) : (
        <div className="mt-3 max-h-60 space-y-3 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-300">{row.label}</span>
                <span className="shrink-0 text-slate-500">
                  {row.count} · {row.pct}%
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-900">
                <div className="h-1.5 rounded-full bg-[#25D366]" style={{ width: `${Math.max(row.pct ? 2 : 0, row.pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function AudienceCard({ audience }: { audience: AudienceSummary }) {
  return (
    <section id="audience" className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="Audience">
      <h2 className="font-bold text-white">Audience</h2>
      <p className="mt-1 text-xs text-slate-500">Who clicks your links</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel kind="devices" rows={audience.devices} />
        <Panel kind="os" rows={audience.os} />
        <Panel kind="countries" rows={audience.countries} />
        <Panel kind="cities" rows={audience.cities} />
      </div>

      <p className="mt-4 text-xs text-slate-600">
        Counted from 21 Oct 2026. Older clicks have no device or location. City data by{" "}
        <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400">
          DB-IP
        </a>
        .
      </p>
    </section>
  );
}

export function AudienceCardLocked() {
  return (
    <section id="audience" className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="Audience">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-white">
            <Lock className="h-4 w-4 text-slate-500" /> Audience
          </h2>
          <p className="mt-1 text-xs text-slate-500">Who clicks your links · Available on Growth</p>
        </div>
        <Link
          href="/billing#plans"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-black hover:bg-[#1fba58]"
        >
          See plans
        </Link>
      </div>
    </section>
  );
}
