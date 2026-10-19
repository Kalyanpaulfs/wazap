"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import EmailCodeConfirm from "@/app/components/EmailCodeConfirm";
import { Download, Mail, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";

export type Lifecycle = {
  requestedAt: string | null;
  scheduledFor: string | null;
  graceDays: number;
  blockers: {
    billing: { method: string; plan: string } | null;
  };
};

export type MarketingPreference = { subscribed: boolean; locked: boolean };

export default function AccountClient({ initial, marketing }: { initial: Lifecycle; marketing: MarketingPreference }) {
  const [data, setData] = useState<Lifecycle>(initial);
  const [emailCode, setEmailCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [subscribed, setSubscribed] = useState(marketing.subscribed);
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [marketingNotice, setMarketingNotice] = useState("");

  async function toggleMarketing() {
    const wanted = !subscribed;
    setMarketingBusy(true);
    setMarketingNotice("");
    try {
      const response = await fetch("/api/account/marketing-consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wanted }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setMarketingNotice(result.error || "Could not update this preference."); return; }
      setSubscribed(wanted);
    } catch {
      setMarketingNotice("We couldn't reach Wazap. Please try again.");
    } finally {
      setMarketingBusy(false);
    }
  }
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

  const blocked = Boolean(data.blockers.billing);

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
            The JSON export contains your account, lead rotators, tracked links, ad links, clicks, usage, payments, and performance/site activity history. Data from features Wazap has since retired is included too, grouped together. Passwords, reset tokens, authentication keys, secret URL parameters, and encrypted provider credentials are excluded.
          </p>
          <a
            href="/api/account/export"
            className="mt-5 inline-flex rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-black"
          >
            Download JSON export
          </a>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-800 bg-[#111811] p-6">
          <Mail className="h-6 w-6 text-[#25D366]" />
          <h2 className="mt-3 text-xl font-bold text-white">Email preferences</h2>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-white">Product news and offers by email</span>
            <button
              type="button"
              role="switch"
              aria-checked={subscribed}
              disabled={marketingBusy || marketing.locked}
              onClick={toggleMarketing}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${subscribed ? "bg-[#25D366]" : "bg-slate-700"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${subscribed ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Login codes, receipts and billing emails are always sent.</p>
          {marketing.locked && <p className="mt-2 text-xs text-amber-300">This address can&apos;t be re-subscribed automatically. Contact support.</p>}
          {marketingNotice && <p role="status" className="mt-2 text-sm text-slate-300">{marketingNotice}</p>}
        </section>

        <section className="mt-6 rounded-3xl border border-red-500/20 bg-red-500/5 p-6">
          {data.scheduledFor ? (
            <>
              <RotateCcw className="h-6 w-6 text-amber-300" />
              <h2 className="mt-3 text-xl font-bold text-white">Account closure scheduled</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Permanent deletion is scheduled for <strong>{new Date(data.scheduledFor).toLocaleString()}</strong>. Restore the account before then to keep your lead rotators, links, clicks, reports and account.
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
                Closure has a {data.graceDays}-day recovery period. When it expires, Wazap permanently removes the account along with your lead rotators, tracked links, ad links and click history. Payment records are kept, with the email anonymised, for tax and legal reasons.
              </p>
              {blocked && (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
                  <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> Resolve these protections first</div>
                  {data.blockers.billing && (
                    <p className="mt-2">Cancel the active {data.blockers.billing.method} {data.blockers.billing.plan} subscription from the dashboard billing controls.</p>
                  )}
                  <div className="mt-3 flex gap-4">
                    <Link href="/billing" className="font-semibold text-[#25D366]">Billing controls →</Link>
                    <Link href="/support" className="font-semibold text-[#25D366]">Contact support →</Link>
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
