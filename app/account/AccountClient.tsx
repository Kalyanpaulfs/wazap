"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import EmailCodeConfirm from "@/app/components/EmailCodeConfirm";
import { Download, LogOut, Mail, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { PLAN_NAMES } from "@/lib/billing";
import { signOut } from "next-auth/react";
import { Switch } from "@/app/ui/Switch";

const BILLING_METHOD_LABEL: Record<string, string> = { dodo: "Dodo", paypal: "PayPal" };

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
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <header>
          <h1 className=" text-4xl font-bold text-text">Account and data</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Export a portable copy of your Wazap records or manage permanent account closure.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-border bg-surface p-6">
          <Download className="h-6 w-6 text-accent" />
          <h2 className="mt-3 text-xl font-bold text-text">Download your data</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            The JSON export contains your account, lead rotators, tracked links, ad links, clicks, usage, payments, and performance/site activity history. Data from features Wazap has since retired is included too, grouped together. Passwords, reset tokens, authentication keys, secret URL parameters, and encrypted provider credentials are excluded.
          </p>
          <a
            href="/api/account/export"
            className="mt-5 inline-flex rounded-full bg-accent px-5 py-3 text-sm font-bold text-on-accent"
          >
            Download JSON export
          </a>
        </section>

        <section className="mt-6 rounded-3xl border border-border bg-surface p-6">
          <ShieldAlert className="h-6 w-6 text-accent" />
          <h2 className="mt-3 text-xl font-bold text-text">Two-factor authentication</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Add an authenticator app to protect sign-in.</p>
          <Link href="/account/security" className="mt-5 inline-flex rounded-full border border-border-strong px-5 py-3 text-sm font-bold text-text">Manage two-factor authentication</Link>
        </section>

        <section className="mt-6 rounded-3xl border border-border bg-surface p-6">
          <Mail className="h-6 w-6 text-accent" />
          <h2 className="mt-3 text-xl font-bold text-text">Email preferences</h2>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-text">Product news and offers by email</span>
            <Switch checked={subscribed} onChange={toggleMarketing} label="Product news and offers by email" disabled={marketingBusy || marketing.locked} />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">Login codes, receipts and billing emails are always sent.</p>
          {marketing.locked && <p className="mt-2 text-xs text-warning">This address can&apos;t be re-subscribed automatically. Contact support.</p>}
          {marketingNotice && <p role="status" className="mt-2 text-sm text-muted">{marketingNotice}</p>}
        </section>

        <section className="mt-6 rounded-3xl border border-danger/20 bg-danger/10 p-6">
          {data.scheduledFor ? (
            <>
              <RotateCcw className="h-6 w-6 text-warning" />
              <h2 className="mt-3 text-xl font-bold text-text">Account closure scheduled</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Permanent deletion is scheduled for <strong>{new Date(data.scheduledFor).toLocaleString()}</strong>. Restore the account before then to keep your lead rotators, links, clicks, reports and account.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => mutate("cancel_deletion")}
                className="mt-5 rounded-full bg-accent px-5 py-3 text-sm font-bold text-on-accent disabled:opacity-50"
              >
                {busy ? "Restoring…" : "Cancel closure and keep my account"}
              </button>
            </>
          ) : (
            <>
              <Trash2 className="h-6 w-6 text-danger" />
              <h2 className="mt-3 text-xl font-bold text-text">Close this account</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Closure has a {data.graceDays}-day recovery period. When it expires, Wazap permanently removes the account along with your lead rotators, tracked links, ad links and click history. Payment records are kept, with the email anonymised, for tax and legal reasons.
              </p>
              {blocked && (
                <div className="mt-4 rounded-xl border border-warning/20 bg-highlight-soft p-4 text-sm text-warning">
                  <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> Resolve these protections first</div>
                  {data.blockers.billing && (
                    <p className="mt-2">
                      Your {PLAN_NAMES[data.blockers.billing.plan] ?? data.blockers.billing.plan} plan still auto-renews
                      ({BILLING_METHOD_LABEL[data.blockers.billing.method] ?? data.blockers.billing.method}). Turn off
                      auto-pay in Plan &amp; billing first, then come back to close your account.
                    </p>
                  )}
                  <div className="mt-3 flex gap-4">
                    <Link href="/billing" className="font-semibold text-accent">Billing controls →</Link>
                    <Link href="/support" className="font-semibold text-accent">Contact support →</Link>
                  </div>
                </div>
              )}
              <EmailCodeConfirm id="delete-email-code" className="mt-5" value={emailCode} onChange={setEmailCode} />
              <label className="mt-4 block text-xs font-semibold text-muted">
                Type DELETE MY WAZAP ACCOUNT
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-border-strong bg-bg px-4 py-3 text-sm text-text"
                />
              </label>
              <button
                type="button"
                disabled={blocked || busy || !emailCode || confirmation !== "DELETE MY WAZAP ACCOUNT"}
                onClick={() => mutate("request_deletion")}
                className="mt-5 rounded-full bg-danger px-5 py-3 text-sm font-bold text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Verifying…" : "Schedule permanent deletion"}
              </button>
            </>
          )}
          {notice && <p role="status" className="mt-4 text-sm text-muted">{notice}</p>}
        </section>

        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-6">
          <div>
            <h2 className="text-xl font-bold text-text">Sign out</h2>
            <p className="mt-1 text-sm text-muted">End your session on this device.</p>
          </div>
          <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="inline-flex items-center gap-2 rounded-full border border-border-strong px-5 py-3 text-sm font-bold text-text transition-colors hover:bg-surface-2">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </section>
      </div>
    </main>
  );
}
