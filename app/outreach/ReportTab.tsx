"use client";
// FEAT-QUEUE: Report tab - filters (list, salesperson, date range), a
// per-salesperson totals table, and a per-customer log. Re-fetches on every
// filter change; CSV export is a plain link (no fetch) so the browser
// handles the download/attachment itself.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import ClientTime from "./ClientTime";
import type { OutreachListData, OutreachMemberData, ReportTotalRow, ReportContactRow } from "./types";

export default function ReportTab({ lists, members }: { lists: OutreachListData[]; members: OutreachMemberData[] }) {
  const [listId, setListId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [totals, setTotals] = useState<ReportTotalRow[]>([]);
  const [rows, setRows] = useState<ReportContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = (() => {
    const qs = new URLSearchParams();
    if (listId) qs.set("list", listId);
    if (memberId) qs.set("member", memberId);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return qs.toString();
  })();

  useEffect(() => {
    let cancelled = false;
    // Intentional: re-fetching the report on every filter change needs an
    // immediate "loading" flip before the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    fetch(`/api/outreach/report${query ? `?${query}` : ""}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load the report.");
        if (cancelled) return;
        setTotals(data.totals || []);
        setRows(data.rows || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the report.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-[#111811] p-4">
        <label className="text-xs text-slate-400">
          List
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25D366]"
          >
            <option value="">All</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Salesperson
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25D366]"
          >
            <option value="">All</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-[#25D366]"
          />
        </label>
        <label className="text-xs text-slate-400">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-[#25D366]"
          />
        </label>
        <a
          href={`/api/outreach/report?${query ? `${query}&` : ""}export=csv`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:border-[#25D366]"
        >
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </section>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="font-bold text-white">By salesperson</h2>
        </div>
        {!loading && totals.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No customers given out yet in this period.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-4 py-3">Today</th>
                    <th className="px-4 py-3">7 days</th>
                    <th className="px-4 py-3">All time</th>
                    <th className="px-4 py-3">Give-backs</th>
                    <th className="px-4 py-3">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((t) => (
                    <tr key={t.memberId} className="border-t border-slate-800/70">
                      <td className="px-5 py-3.5 font-semibold text-white">{t.memberName}</td>
                      <td className="px-4 py-3.5 text-slate-300">{t.today}</td>
                      <td className="px-4 py-3.5 text-slate-300">{t.last7Days}</td>
                      <td className="px-4 py-3.5 text-slate-300">{t.allTime}</td>
                      <td className="px-4 py-3.5 text-slate-300">{t.giveBackCount}</td>
                      <td className="px-4 py-3.5"><Flags t={t} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-4 sm:hidden">
              {totals.map((t) => (
                <div key={t.memberId} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-white">{t.memberName}</p>
                    <Flags t={t} />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Today {t.today} · 7 days {t.last7Days} · All time {t.allTime} · Give-backs {t.giveBackCount}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </article>

      <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="font-bold text-white">By customer</h2>
        </div>
        {!loading && rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No customers given out yet in this period.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Given to</th>
                    <th className="px-4 py-3">List</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-800/70">
                      <td className="px-5 py-3.5 font-semibold text-white">{r.contactName || "-"}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-300">+{r.contactPhone}</td>
                      <td className="px-4 py-3.5 text-slate-300">{r.memberName || "-"}</td>
                      <td className="px-4 py-3.5 text-slate-300">{r.listName}</td>
                      <td className="px-4 py-3.5 text-slate-300">{r.givenAt ? <ClientTime iso={r.givenAt} /> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-4 sm:hidden">
              {rows.map((r, i) => (
                <div key={i} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="font-semibold text-white">{r.contactName || "-"}</p>
                  <p className="font-mono text-xs text-slate-500">+{r.contactPhone}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {r.memberName || "-"} · {r.listName}
                  </p>
                  <p className="text-xs text-slate-500">{r.givenAt ? <ClientTime iso={r.givenAt} /> : "-"}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </article>
    </div>
  );
}

function Flags({ t }: { t: ReportTotalRow }) {
  if (!t.burst && !t.manyGiveBacks) return <span className="text-slate-600">-</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {t.burst && (
        <span title="Many customers claimed in just a few minutes" className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
          Burst
        </span>
      )}
      {t.manyGiveBacks && (
        <span title="An unusually high number of give-backs" className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
          Give-backs
        </span>
      )}
    </span>
  );
}
