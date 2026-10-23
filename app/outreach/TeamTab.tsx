"use client";
// FEAT-QUEUE: Team tab - add one salesperson, CSV import with preview, and
// the members table (edit email / log out devices / remove).
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import PhoneInput, { type PhoneInputValue } from "@/app/components/PhoneInput";
import type { OutreachMemberData, MembersImportPreview, MembersImportConfirmResult } from "./types";

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

export default function TeamTab({
  members,
  memberCount,
  memberLimit,
  defaultCountry,
  onMembersChange,
  onMemberCountChange,
}: {
  members: OutreachMemberData[];
  memberCount: number;
  memberLimit: number;
  defaultCountry: string | null;
  onMembersChange: (update: (prev: OutreachMemberData[]) => OutreachMemberData[]) => void;
  onMemberCountChange: (update: (prev: number) => number) => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-300">
        {memberCount} of {memberLimit} salespeople
      </p>

      <AddMemberForm
        defaultCountry={defaultCountry}
        onAdded={(member) => {
          onMembersChange((prev) => [...prev, member]);
          onMemberCountChange((prev) => prev + 1);
        }}
      />

      <ImportMembers
        onImported={async () => {
          try {
            const res = await fetch("/api/outreach/members");
            const data = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(data.members)) {
              const mapped: OutreachMemberData[] = data.members.map((m: OutreachMemberData) => ({
                id: m.id,
                name: m.name,
                phone: m.phone,
                email: m.email,
                active: m.active,
                removedAt: m.removedAt,
              }));
              onMembersChange(() => mapped);
              onMemberCountChange(() => mapped.filter((m) => m.active && !m.removedAt).length);
            }
          } catch {
            /* the table keeps its last known state if the refetch fails */
          }
        }}
      />

      <MembersTable members={members} onMembersChange={onMembersChange} onMemberCountChange={onMemberCountChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add one member
// ---------------------------------------------------------------------------
function AddMemberForm({ defaultCountry, onAdded }: { defaultCountry: string | null; onAdded: (member: OutreachMemberData) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<PhoneInputValue>({ e164Digits: "", valid: false });
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!name.trim()) return setError("Enter a name.");
    if (!phone.valid) return setError("Add a valid WhatsApp number.");
    if (!email.trim()) return setError("Enter an email address.");
    setSaving(true);
    try {
      const res = await fetch("/api/outreach/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: "+" + phone.e164Digits, email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add this salesperson.");
      onAdded({
        id: data.member.id,
        name: data.member.name,
        phone: data.member.phone,
        email: data.member.email,
        active: data.member.active,
        removedAt: data.member.removedAt,
      });
      setName("");
      setPhone({ e164Digits: "", valid: false });
      setEmail("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add this salesperson.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-[#111811] p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-white">Add a salesperson</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Name"
          maxLength={100}
          className="rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
        <PhoneInput defaultCountry={defaultCountry} onChange={setPhone} required placeholder="WhatsApp number" />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          type="email"
          className="rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {saving ? "Adding…" : "Add salesperson"}
        </button>
        {success && <span className="text-sm font-semibold text-[#25D366]">Added.</span>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// CSV import with preview
// ---------------------------------------------------------------------------
// defaultCountry isn't sent here - the import API always cleans phones
// against the TEAM's own saved default country (Settings tab), not a
// per-request value.
function ImportMembers({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<MembersImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<MembersImportConfirmResult | null>(null);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    setPreview(null);
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    setPreviewing(true);
    try {
      const res = await fetch("/api/outreach/members/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not read this CSV file.");
      setPreview(data as MembersImportPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this CSV file.");
    } finally {
      setPreviewing(false);
    }
  }

  function downloadRejected() {
    if (!preview) return;
    downloadCsv("rejected-salespeople.csv", [["row", "reason"], ...preview.rejected.map((r) => [String(r.row), r.reason])]);
  }

  async function confirmImport() {
    setConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/outreach/members/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not import this file.");
      setResult(data as MembersImportConfirmResult);
      setPreview(null);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import this file.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-[#111811] p-5 sm:p-6">
      <div>
        <h2 className="text-sm font-semibold text-white">Import salespeople from a CSV</h2>
        <p className="mt-1 text-xs text-slate-500">Columns: name, phone, email.</p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        aria-label="Choose a CSV file of salespeople"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border file:border-slate-700 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-slate-200 hover:file:border-[#25D366]"
      />
      {fileName && <p className="text-xs text-slate-500">{fileName}</p>}
      {previewing && <p className="text-xs text-slate-400">Reading file…</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {preview && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-sm text-slate-200">
            {preview.valid.length} ready, {preview.rejected.length} rejected
            {preview.alreadyOnTeam > 0 && <> · {preview.alreadyOnTeam} already on the team</>}
          </p>
          {preview.rejected.length > 0 && (
            <button type="button" onClick={downloadRejected} className="text-xs font-semibold text-[#25D366] hover:underline">
              Download rejected
            </button>
          )}
          <div>
            <button
              type="button"
              onClick={confirmImport}
              disabled={confirming || !preview.valid.length}
              className="rounded-full bg-[#25D366] px-5 py-2 text-sm font-bold text-black hover:bg-[#1fba58] disabled:opacity-50"
            >
              {confirming ? "Importing…" : "Confirm import"}
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className="text-sm text-slate-200">
          {result.created} added, {result.reactivated} reactivated, {result.skipped} skipped.
          {result.blockedByLimit && <span className="text-amber-300"> Some rows were skipped - your plan&apos;s salesperson limit was reached.</span>}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Members table
// ---------------------------------------------------------------------------
function MembersTable({
  members,
  onMembersChange,
  onMemberCountChange,
}: {
  members: OutreachMemberData[];
  onMembersChange: (update: (prev: OutreachMemberData[]) => OutreachMemberData[]) => void;
  onMemberCountChange: (update: (prev: number) => number) => void;
}) {
  function handleUpdated(updated: OutreachMemberData) {
    onMembersChange((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }
  function handleRemoved(id: string) {
    onMembersChange((prev) => prev.map((m) => (m.id === id ? { ...m, active: false, removedAt: new Date().toISOString() } : m)));
    onMemberCountChange((prev) => Math.max(0, prev - 1));
  }

  if (!members.length) {
    return <p className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No salespeople yet.</p>;
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <MemberRow key={member.id} member={member} variant="row" onUpdated={handleUpdated} onRemoved={handleRemoved} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-4 sm:hidden">
        {members.map((member) => (
          <MemberRow key={member.id} member={member} variant="card" onUpdated={handleUpdated} onRemoved={handleRemoved} />
        ))}
      </div>
    </article>
  );
}

function MemberRow({
  member,
  variant,
  onUpdated,
  onRemoved,
}: {
  member: OutreachMemberData;
  variant: "row" | "card";
  onUpdated: (m: OutreachMemberData) => void;
  onRemoved: (id: string) => void;
}) {
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(member.email);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutDone, setLogoutDone] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const status = member.active && !member.removedAt ? "Active" : "Removed";

  async function saveEmail() {
    setSavingEmail(true);
    setEmailError("");
    try {
      const res = await fetch("/api/outreach/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, email: emailDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save this email.");
      onUpdated({ ...member, email: emailDraft.trim().toLowerCase() });
      setEditingEmail(false);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Could not save this email.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function logoutDevices() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const res = await fetch("/api/outreach/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The route validates name/phone/email as strings for every POST,
        // even this logoutDevices action - send the member's own values.
        body: JSON.stringify({ action: "logoutDevices", memberId: member.id, name: member.name, phone: member.phone, email: member.email }),
      });
      if (!res.ok) throw new Error("Could not log out this member's devices.");
      setLogoutDone(true);
      setTimeout(() => setLogoutDone(false), 2000);
    } catch (e) {
      setLogoutError(e instanceof Error ? e.message : "Could not log out this member's devices.");
    } finally {
      setLoggingOut(false);
    }
  }

  async function remove() {
    setRemoving(true);
    setRemoveError("");
    try {
      const res = await fetch("/api/outreach/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });
      if (!res.ok) throw new Error("Could not remove this member.");
      onRemoved(member.id);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Could not remove this member.");
      setRemoving(false);
      setConfirmingRemove(false);
    }
  }

  const statusBadge = (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
        status === "Active" ? "border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-500"
      }`}
    >
      {status}
    </span>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {editingEmail ? (
        <>
          <input
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            aria-label={`Email for ${member.name}`}
            className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:outline-none focus:border-[#25D366]"
          />
          <button type="button" onClick={saveEmail} disabled={savingEmail} className="rounded-full bg-[#25D366] px-3 py-1 font-semibold text-black hover:bg-[#1fba58] disabled:opacity-50">
            {savingEmail ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingEmail(false);
              setEmailDraft(member.email);
              setEmailError("");
            }}
            disabled={savingEmail}
            className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:border-slate-500"
          >
            Cancel
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setEditingEmail(true)} className="rounded-full border border-slate-700 px-3 py-1 font-semibold text-slate-200 hover:border-[#25D366] hover:text-white">
          Edit email
        </button>
      )}
      {emailError && <span className="text-red-400">{emailError}</span>}

      {!editingEmail && (
        <button
          type="button"
          onClick={logoutDevices}
          disabled={loggingOut}
          className="rounded-full border border-slate-700 px-3 py-1 font-semibold text-slate-200 hover:border-[#25D366] hover:text-white disabled:opacity-50"
        >
          {logoutDone ? "Logged out" : loggingOut ? "Logging out…" : "Log out all devices"}
        </button>
      )}
      {logoutError && <span className="text-red-400">{logoutError}</span>}

      {!editingEmail &&
        (confirmingRemove ? (
          <span className="flex items-center gap-2">
            <span className="text-slate-300">Remove?</span>
            <button type="button" onClick={remove} disabled={removing} className="rounded-full bg-red-500/90 px-3 py-1 font-semibold text-white hover:bg-red-500 disabled:opacity-50">
              {removing ? "Removing…" : "Yes"}
            </button>
            <button type="button" onClick={() => setConfirmingRemove(false)} disabled={removing} className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:border-slate-500">
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="rounded-full border border-red-500/40 px-3 py-1 font-semibold text-red-300 hover:bg-red-500/10"
          >
            Remove
          </button>
        ))}
      {removeError && <span className="text-red-400">{removeError}</span>}
    </div>
  );

  if (variant === "row") {
    return (
      <tr className="border-t border-slate-800/70">
        <td className="px-5 py-3.5 font-semibold text-white">{member.name}</td>
        <td className="px-4 py-3.5 font-mono text-slate-300">+{member.phone}</td>
        <td className="px-4 py-3.5 text-slate-300">{member.email}</td>
        <td className="px-4 py-3.5">{statusBadge}</td>
        <td className="px-4 py-3.5">{actions}</td>
      </tr>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">{member.name}</p>
          <p className="font-mono text-xs text-slate-500">+{member.phone}</p>
          <p className="truncate text-xs text-slate-400">{member.email}</p>
        </div>
        {statusBadge}
      </div>
      <div className="mt-3">{actions}</div>
    </div>
  );
}
