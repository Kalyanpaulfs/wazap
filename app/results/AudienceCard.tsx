import Link from "next/link";
import { Lock, Monitor, Shield, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import { AUDIENCE_TRACKING_START, PRIVATE_NETWORK_LABEL, type AudienceRow, type AudienceSummary } from "@/lib/audience";

// "21 Oct 2026" from "2026-10-21", for the footnote and the before-tracking message.
const TRACKING_START_LABEL = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
  new Date(`${AUDIENCE_TRACKING_START}T00:00:00.000Z`)
);

// "Audience" section on /results (FEAT-AUDIENCE, Growth/Agency only): device,
// OS, country and city of the people who click a customer's links. Follows
// the page's existing selected date range - no separate Lifetime/Plan
// toggle. Two halves: "What they use" (device tiles + one split OS bar) and
// "Where they are" (ranked country/city rows with a country badge).

const DEVICE_TILES: Array<{ label: string; Icon: LucideIcon }> = [
  { label: "Mobile", Icon: Smartphone },
  { label: "Desktop", Icon: Monitor },
  { label: "Tablet", Icon: Tablet },
];

// One colour per operating system slice (in order of size).
const OS_COLOURS = ["#25D366", "#38BDF8", "#A78BFA", "#FBBF24", "#F472B6", "#2DD4BF", "#94A3B8"];

function DeviceTiles({ rows }: { rows: AudienceRow[] }) {
  const top = rows[0]?.label;
  return (
    <div className="grid grid-cols-3 gap-2">
      {DEVICE_TILES.map(({ label, Icon }) => {
        const row = rows.find((item) => item.label === label);
        const isTop = !!row && label === top;
        return (
          <div
            key={label}
            className={`rounded-2xl border p-3 ${isTop ? "border-[#25D366]/50 bg-[#25D366]/10" : "border-slate-800 bg-[#0d130e]"} ${row ? "" : "opacity-40"}`}
          >
            <Icon className={`h-5 w-5 ${isTop ? "text-[#25D366]" : "text-slate-400"}`} />
            <p className="mt-3 text-2xl font-bold tabular-nums text-white">{row ? row.pct : 0}%</p>
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-[11px] text-slate-600">{row ? `${row.count} click${row.count === 1 ? "" : "s"}` : "No clicks"}</p>
          </div>
        );
      })}
    </div>
  );
}

function OsBar({ rows }: { rows: AudienceRow[] }) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-900" role="img" aria-label={rows.map((row) => `${row.label} ${row.pct}%`).join(", ")}>
        {rows.map((row, i) => (
          <div key={row.label} style={{ width: `${row.pct}%`, background: OS_COLOURS[i % OS_COLOURS.length] }} className="h-full border-r border-[#111811] last:border-r-0" />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {rows.map((row, i) => (
          <li key={row.label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-[#0d130e] px-2.5 py-1 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: OS_COLOURS[i % OS_COLOURS.length] }} />
            {row.label}
            <span className="tabular-nums text-slate-500">{row.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CountryBadge({ row }: { row: AudienceRow }) {
  if (row.code) {
    return <span className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[10px] font-bold tracking-wide text-slate-200">{row.code}</span>;
  }
  return (
    <span className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-400" title={PRIVATE_NETWORK_LABEL}>
      <Shield className="h-3.5 w-3.5" />
    </span>
  );
}

function RankedList({ title, rows }: { title: string; rows: AudienceRow[] }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      <ol className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {rows.map((row, i) => (
          <li key={row.label} className={`relative overflow-hidden rounded-xl border px-3 py-2 ${i === 0 ? "border-[#25D366]/40" : "border-slate-800"}`}>
            {/* Soft fill behind the row shows its share, instead of a separate bar. */}
            <span aria-hidden className="absolute inset-y-0 left-0 bg-[#25D366]/[0.08]" style={{ width: `${row.pct}%` }} />
            <span className="relative flex items-center gap-2.5 text-sm">
              <span className="w-5 shrink-0 text-xs tabular-nums text-slate-600">{String(i + 1).padStart(2, "0")}</span>
              <CountryBadge row={row} />
              <span className="min-w-0 flex-1 truncate text-slate-200">{row.label}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{row.count}</span>
              <span className="shrink-0 rounded-full bg-[#25D366]/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-[#25D366]">{row.pct}%</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AudienceCard({
  audience,
  periodBeforeTracking,
  last7dHref,
}: {
  audience: AudienceSummary;
  /** The selected period ends entirely before AUDIENCE_TRACKING_START - there's no data to wait for, so skip the usual empty-state copy. */
  periodBeforeTracking: boolean;
  /** Where the "See the last 7 days" link should point (same period chip the chips row uses). */
  last7dHref: string;
}) {
  const total = audience.devices.reduce((sum, row) => sum + row.count, 0);
  const countryCount = audience.countries.filter((row) => row.code).length;

  return (
    <section id="audience" className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="Audience">
      <h2 className="font-bold text-white">Audience</h2>
      <p className="mt-1 text-xs text-slate-500">
        {total ? `${total} click${total === 1 ? "" : "s"} from ${countryCount} countr${countryCount === 1 ? "y" : "ies"} in this period` : "Who clicks your links"}
      </p>

      {total === 0 && periodBeforeTracking ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
          <p>Audience tracking started on {TRACKING_START_LABEL}, so there&apos;s no device or location data for these dates.</p>
          <Link href={last7dHref} className="mt-3 inline-flex font-semibold text-[#25D366] hover:underline">
            See the last 7 days
          </Link>
        </div>
      ) : total === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">No clicks in this period yet. Share a link and the first visitors show up here.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-800 p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-white">What they use</h3>
            <div className="mt-3">
              <DeviceTiles rows={audience.devices} />
            </div>
            <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">Operating system</h4>
            <OsBar rows={audience.os} />
          </div>

          <div className="rounded-2xl border border-slate-800 p-4 lg:col-span-3">
            <h3 className="text-sm font-semibold text-white">Where they are</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RankedList title="Countries" rows={audience.countries} />
              <RankedList title="Cities" rows={audience.cities} />
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-600">
        Counted from {TRACKING_START_LABEL}. Older clicks have no device or location. City data by{" "}
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
