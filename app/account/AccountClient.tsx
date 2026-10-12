"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import EmailCodeConfirm from "@/app/components/EmailCodeConfirm";
import { Download, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";

export type Lifecycle = {
  requestedAt: string | null;
  scheduledFor: string | null;
  graceDays: number;
  blockers: {
    billing: { method: string; plan: string } | null;
    sharedOwnedWorkspaces: { id: string; name: string; members: number }[];
  };
};

export default function AccountClient({ initial }: { initial: Lifecycle }) {
  const [data, setData] = useState<Lifecycle>(initial);
  const [emailCode, setEmailCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/account/lifecycle", { cache: "no-store" });
    if (response.status === 401) {
      location.href = "/login?redirect=/account";
      return;
    }
    setData(await response.json());
  }, []);

  async function mutate(action: "request_deletion" | "cancel_deletion") {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/account/lifecycle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, emailCode, confirmation }),
    });
    const result = await response.json();
    setBusy(false);
    setNotice(result.notice || result.error || "Unable to update the account.");
    if (response.ok) {
      setEmailCode("");
      setConfirmation("");
      await load();
    }
  }

  const blocked = Boolean(data.blockers.billing || data.blockers.sharedOwnedWorkspaces.length);

  return (
    <main className="hero-bg min-h-screen px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <header>
          <Link href="/dashboard" className="text-sm font-semibold text-[#25D366]">← Dashboard</Link>
          <h1 className="mt-4 text-4xl font-bold text-white">Account and data</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Export a portable copy of your Wazap records or manage permanent account closure.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-[#111811] p-6">
          <Download className="h-6 w-6 text-[#25D366]" />
          <h2 className="mt-3 text-xl font-bold text-white">Download your data</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            The JSON export contains your account, billing and tool history, conversations, CRM, tasks, AI governance, automations, channel events, API and webhook evidence, Store activity, partner attribution, and support records from workspaces you own. Passwords, reset tokens, authentication keys, secret URL parameters, and encrypted provider credentials are excluded.
          </p>
          <a
            href="/api/account/export"
            className="mt-5 inline-flex rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-black"
          >
            Download JSON export
          </a>
        </section>

        <section className="mt-6 rounded-3xl border border-red-500/20 bg-red-500/5 p-6">
          {data.scheduledFor ? (
            <>
              <RotateCcw className="h-6 w-6 text-amber-300" />
              <h2 className="mt-3 text-xl font-bold text-white">Account closure scheduled</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Permanent deletion is scheduled for <strong>{new Date(data.scheduledFor).toLocaleString()}</strong>. Restore the account before then to keep every workspace and record.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => mutate("cancel_deletion")}
                className="mt-5 rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
              >
                {busy ? "Restoring…" : "Cancel closure and keep my account"}
              </button>
            </>
          ) : (
            <>
              <Trash2 className="h-6 w-6 text-red-300" />
              <h2 className="mt-3 text-xl font-bold text-white">Close this account</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Closure has a {data.graceDays}-day recovery period. When it expires, Wazap permanently removes the account and sole-owner workspaces, disconnects channels, and deletes conversation and CRM data. Provider transaction records may remain with payment providers where legally required.
              </p>
              {blocked && (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                  <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> Resolve these protections first</div>
                  {data.blockers.billing && (
                    <p className="mt-2">Cancel the active {data.blockers.billing.method} {data.blockers.billing.plan} subscription from the dashboard billing controls.</p>
                  )}
                  {data.blockers.sharedOwnedWorkspaces.map((workspace) => (
                    <p key={workspace.id} className="mt-2">Transfer ownership or remove the other members from {workspace.name} ({workspace.members} members).</p>
                  ))}
                  <div className="mt-3 flex gap-4">
                    <Link href="/dashboard" className="font-semibold text-[#25D366]">Billing controls →</Link>
                    <Link href="/workspace" className="font-semibold text-[#25D366]">Workspace controls →</Link>
                  </div>
                </div>
              )}
              <EmailCodeConfirm id="delete-email-code" className="mt-5" value={emailCode} onChange={setEmailCode} />
              <label className="mt-4 block text-xs font-semibold text-slate-400">
                Type DELETE MY WAZAP ACCOUNT
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white"
                />
              </label>
              <button
                type="button"
                disabled={blocked || busy || !emailCode || confirmation !== "DELETE MY WAZAP ACCOUNT"}
                onClick={() => mutate("request_deletion")}
                className="mt-5 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Verifying…" : "Schedule permanent deletion"}
              </button>
            </>
          )}
          {notice && <p role="status" className="mt-4 text-sm text-slate-300">{notice}</p>}
        </section>
      </div>
    </main>
  );
}
