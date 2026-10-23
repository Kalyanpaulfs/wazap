"use client";
// FEAT-QUEUE: Customer lists tab - upload a list (dry-run preview, then
// confirm), and manage existing lists (pause/resume, reorder, delete).
import { useState } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, Pause as PauseIcon, Play, Trash2 } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import type { OutreachListData, ListUploadPreview } from "./types";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const STATUS_LABEL: Record<string, string> = { waiting: "Waiting", running: "Running", paused: "Paused", finished: "Finished" };
const STATUS_CLASS: Record<string, string> = {
  running: "border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366]",
  waiting: "border-slate-700 text-slate-400",
  paused: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  finished: "border-slate-700 text-slate-500",
};

export default function ListsTab({
  lists,
  contactTotal,
  contactLimit,
  defaultCountry,
  onListsChange,
  onContactTotalChange,
  onDefaultCountryChange,
}: {
  lists: OutreachListData[];
  contactTotal: number;
  contactLimit: number;
  defaultCountry: string | null;
  onListsChange: (update: (prev: OutreachListData[]) => OutreachListData[]) => void;
  onContactTotalChange: (update: (prev: number) => number) => void;
  onDefaultCountryChange: (country: string) => void;
}) {
  async function reloadLists() {
    try {
      const res = await fetch("/api/outreach/lists");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.lists)) {
        const mapped: OutreachListData[] = data.lists.map((l: OutreachListData) => ({
          id: l.id,
          name: l.name,
          position: l.position,
          status: l.status,
          totalCount: l.totalCount,
          givenCount: l.givenCount,
        }));
        onListsChange(() => mapped);
        onContactTotalChange(() => mapped.reduce((sum, l) => sum + l.totalCount, 0));
      }
    } catch {
      /* the table keeps its last known state if the refetch fails */
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-300">
        {contactTotal.toLocaleString()} of {contactLimit.toLocaleString()} contacts
      </p>

      <UploadList
        defaultCountry={defaultCountry}
        contactTotal={contactTotal}
        contactLimit={contactLimit}
        onUploaded={reloadLists}
        onDefaultCountryChange={onDefaultCountryChange}
      />

      <ListsTable lists={lists} onChanged={reloadLists} onListsChange={onListsChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload form + dry-run preview
// ---------------------------------------------------------------------------
function UploadList({
  defaultCountry,
  contactTotal,
  contactLimit,
  onUploaded,
  onDefaultCountryChange,
}: {
  defaultCountry: string | null;
  contactTotal: number;
  contactLimit: number;
  onUploaded: () => void;
  onDefaultCountryChange: (country: string) => void;
}) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState(defaultCountry || "");
  const [countryError, setCountryError] = useState("");
  const [consent, setConsent] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ListUploadPreview | null>(null);
  const [duplicateChoice, setDuplicateChoice] = useState<"skip" | "include">("skip");
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  const [success, setSuccess] = useState("");

  // This list's phone numbers are completed against the TEAM's default
  // country (the upload API always reads it fresh server-side, ignoring any
  // per-request value) - so picking a different country here saves it as
  // the team's new default before the file is read, same field Settings
  // shows.
  async function handleCountryChange(next: string) {
    setCountry(next);
    setCountryError("");
    if (!next) return;
    try {
      const res = await fetch("/api/outreach/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultCountry: next }),
      });
      if (!res.ok) throw new Error("Could not save the default country.");
      onDefaultCountryChange(next);
    } catch (e) {
      setCountryError(e instanceof Error ? e.message : "Could not save the default country.");
    }
  }

  async function handleFile(file: File) {
    setError("");
    setUpgrade(false);
    setPreview(null);
    setSuccess("");
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    setPreviewing(true);
    try {
      const res = await fetch("/api/outreach/lists/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, dryRun: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not read this CSV file.");
      setPreview(data as ListUploadPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this CSV file.");
    } finally {
      setPreviewing(false);
    }
  }

  function downloadRejected() {
    if (!preview) return;
    downloadCsv("rejected-contacts.csv", [["row", "reason"], ...preview.rejected.map((r) => [String(r.row), r.reason])]);
  }

  const effectiveValid = preview ? (duplicateChoice === "skip" ? preview.valid.length - preview.alreadyContactedCount : preview.valid.length) : 0;
  const wouldExceed = preview ? contactTotal + effectiveValid > contactLimit : false;

  async function confirmUpload() {
    if (!name.trim()) return setError("Enter a list name.");
    if (!consent) return setError("Confirm that these customers agreed to be contacted.");
    setConfirming(true);
    setError("");
    setUpgrade(false);
    try {
      const res = await fetch("/api/outreach/lists/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), csv: csvText, consent: true, dryRun: false, duplicateChoice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUpgrade(Boolean(data.upgrade));
        throw new Error(data.error || "Could not upload this list.");
      }
      setSuccess(`Added ${data.created} contacts${data.skippedDuplicates ? ` (${data.skippedDuplicates} already-contacted customers skipped)` : ""}.`);
      setName("");
      setConsent(false);
      setCsvText("");
      setFileName("");
      setPreview(null);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload this list.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-[#111811] p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-white">Upload a customer list</h2>
      <p className="text-xs text-slate-500">Columns: phone (required), name, notes.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="List name"
          aria-label="List name"
          maxLength={100}
          className="rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
        <select
          value={country}
          onChange={(e) => handleCountryChange(e.target.value)}
          aria-label="Default country for this file"
          className="rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#25D366]"
        >
          <option value="">Default country (for numbers with no code)</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.dial} {c.name}
            </option>
          ))}
        </select>
      </div>
      {countryError && <p role="alert" className="text-xs text-red-400">{countryError}</p>}

      <input
        type="file"
        accept=".csv"
        aria-label="Choose a CSV file of customers"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border file:border-slate-700 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-slate-200 hover:file:border-[#25D366]"
      />
      {fileName && <p className="text-xs text-slate-500">{fileName}</p>}
      {previewing && <p className="text-xs text-slate-400">Reading file…</p>}

      <label className="flex items-start gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" required />
        These customers agreed to be contacted.
      </label>

      {preview && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-sm text-slate-200">
            {preview.valid.length} ready, {preview.rejected.length} rejected
          </p>
          {preview.rejected.length > 0 && (
            <button type="button" onClick={downloadRejected} className="text-xs font-semibold text-[#25D366] hover:underline">
              Download rejected
            </button>
          )}
          {preview.alreadyContactedCount > 0 && (
            <div>
              <p className="text-sm text-amber-300">{preview.alreadyContactedCount} were already given out in an old list.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateChoice("skip")}
                  aria-pressed={duplicateChoice === "skip"}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                    duplicateChoice === "skip" ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300"
                  }`}
                >
                  Skip them
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateChoice("include")}
                  aria-pressed={duplicateChoice === "include"}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                    duplicateChoice === "include" ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300"
                  }`}
                >
                  Include them
                </button>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">{preview.remainingRoom.toLocaleString()} contacts of room left on your plan.</p>
          {wouldExceed && <p className="text-sm text-amber-300">This would go over your plan&apos;s contact limit.</p>}

          <div>
            <button
              type="button"
              onClick={confirmUpload}
              disabled={confirming || wouldExceed || !effectiveValid}
              className="rounded-full bg-[#25D366] px-5 py-2 text-sm font-bold text-black hover:bg-[#1fba58] disabled:opacity-50"
            >
              {confirming ? "Uploading…" : "Confirm upload"}
            </button>
          </div>
        </div>
      )}

      {success && <p className="text-sm font-semibold text-[#25D366]">{success}</p>}
      {error && (
        <div className="space-y-1">
          <p role="alert" className="text-sm text-red-400">{error}</p>
          {upgrade && (
            <Link href="/billing#plans" className="inline-flex text-xs font-semibold text-[#25D366] hover:underline">
              See plans →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Lists table
// ---------------------------------------------------------------------------
function ListsTable({
  lists,
  onChanged,
  onListsChange,
}: {
  lists: OutreachListData[];
  onChanged: () => void;
  onListsChange: (update: (prev: OutreachListData[]) => OutreachListData[]) => void;
}) {
  const sorted = [...lists].sort((a, b) => a.position - b.position);

  async function move(id: string, direction: "up" | "down") {
    const ids = sorted.map((l) => l.id);
    const i = ids.indexOf(id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      const res = await fetch("/api/outreach/lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: ids }),
      });
      if (res.ok) onChanged();
    } catch {
      /* table keeps its current order if the request fails */
    }
  }

  async function togglePause(id: string, paused: boolean) {
    try {
      const res = await fetch("/api/outreach/lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paused }),
      });
      if (res.ok) onChanged();
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    const res = await fetch("/api/outreach/lists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) onListsChange((prev) => prev.filter((l) => l.id !== id));
  }

  if (!sorted.length) {
    return <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No customer lists yet.</p>;
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-4 py-3">Customers</th>
              <th className="px-4 py-3">Given</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((list, i) => (
              <ListRow key={list.id} list={list} index={i} count={sorted.length} variant="row" move={move} togglePause={togglePause} remove={remove} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-4 sm:hidden">
        {sorted.map((list, i) => (
          <ListRow key={list.id} list={list} index={i} count={sorted.length} variant="card" move={move} togglePause={togglePause} remove={remove} />
        ))}
      </div>
    </article>
  );
}

function ListRow({
  list,
  index,
  count,
  variant,
  move,
  togglePause,
  remove,
}: {
  list: OutreachListData;
  index: number;
  count: number;
  variant: "row" | "card";
  move: (id: string, direction: "up" | "down") => void;
  togglePause: (id: string, paused: boolean) => void;
  remove: (id: string) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await remove(list.id);
  }

  const statusBadge = (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[list.status]}`}>{STATUS_LABEL[list.status]}</span>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {list.status !== "finished" &&
        (list.status === "paused" ? (
          <button
            type="button"
            onClick={() => togglePause(list.id, false)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 font-semibold text-slate-200 hover:border-[#25D366] hover:text-white"
          >
            <Play className="h-3.5 w-3.5" /> Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => togglePause(list.id, true)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 font-semibold text-slate-200 hover:border-[#25D366] hover:text-white"
          >
            <PauseIcon className="h-3.5 w-3.5" /> Pause
          </button>
        ))}
      <button
        type="button"
        onClick={() => move(list.id, "up")}
        disabled={index === 0}
        aria-label="Move up"
        className="rounded-full border border-slate-700 p-1.5 text-slate-300 hover:border-slate-500 disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => move(list.id, "down")}
        disabled={index === count - 1}
        aria-label="Move down"
        className="rounded-full border border-slate-700 p-1.5 text-slate-300 hover:border-slate-500 disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {confirmingDelete ? (
        <span className="flex items-center gap-2">
          <span className="text-slate-300">Delete for good?</span>
          <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-full bg-red-500/90 px-3 py-1 font-semibold text-white hover:bg-red-500 disabled:opacity-50">
            {deleting ? "Deleting…" : "Yes"}
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:border-slate-500">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex items-center gap-1 rounded-full border border-red-500/40 px-3 py-1 font-semibold text-red-300 hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      )}
    </div>
  );

  if (variant === "row") {
    return (
      <tr className="border-t border-slate-800/70">
        <td className="px-5 py-3.5 font-semibold text-white">{list.name}</td>
        <td className="px-4 py-3.5 text-slate-300">{list.totalCount.toLocaleString()}</td>
        <td className="px-4 py-3.5 text-slate-300">{list.givenCount.toLocaleString()}</td>
        <td className="px-4 py-3.5">{statusBadge}</td>
        <td className="px-4 py-3.5">{actions}</td>
      </tr>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-white">{list.name}</p>
        {statusBadge}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {list.totalCount.toLocaleString()} customers · {list.givenCount.toLocaleString()} given
      </p>
      <div className="mt-3">{actions}</div>
    </div>
  );
}
