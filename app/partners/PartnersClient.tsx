"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";

type Attribution = { id: string; source: string | null; status: string; createdAt: string };
type PartnerData = {
  partner?: { referralCode: string; status: string; termsVersion: string | null; termsAcceptedAt: string | null; attributionWindowDays: number; attributions: Attribution[] } | null;
  metrics?: { touches: number; activeUnclaimedTouches: number; signups: number; customers: number; conversionRate: number; influencedRevenue: number };
  policy?: { termsVersion: string; attributionWindowDays: number; termsUrl: string; payoutsEnabled: boolean };
};

export default function PartnersClient() {
  const [data, setData] = useState<PartnerData>({});
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState("");
  const load = () => fetch("/api/partners").then((response) => response.json()).then(setData);
  useEffect(() => { void load(); }, []);
  async function enroll() {
    setNotice("");
    const response = await fetch("/api/partners", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acceptTerms: accepted, termsVersion: data.policy?.termsVersion }) });
    const result = await response.json();
    setNotice(result.error || result.notice || "Partner attribution updated.");
    await load();
  }
  const partner = data.partner;
  const metrics = data.metrics || { touches: 0, activeUnclaimedTouches: 0, signups: 0, customers: 0, conversionRate: 0, influencedRevenue: 0 };
  const referralUrl = useMemo(() => partner ? `https://wazap.lt/?partner=${encodeURIComponent(partner.referralCode)}` : "", [partner]);
  const needsAcceptance = !partner || partner.status !== "active" || partner.termsVersion !== data.policy?.termsVersion || !partner.termsAcceptedAt;
  return (
    <main className="min-h-screen px-4 py-14">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-3xl font-bold text-text">Partner attribution</h1>
        <p className="mt-3 text-muted">Track consented business introductions from a server-recorded first touch through trial signup and verified paid conversion. The attribution window is {data.policy?.attributionWindowDays || 30} days. Compensation and payouts remain inactive unless separately agreed in writing.</p>
        {needsAcceptance ? (
          <div className="mt-6 rounded-xl border border-border-strong bg-bg p-4">
            <label className="flex items-start gap-3 text-sm text-muted"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1"/><span>I am authorized to bind this workspace and accept the current <a href={data.policy?.termsUrl || "/partner-terms"} target="_blank" className="font-semibold text-accent">Partner Participation Terms</a>, including the 30-day first-touch rule, consent and brand restrictions, and no-compensation-without-a-separate-written-agreement rule.</span></label>
            <button disabled={!accepted} onClick={enroll} className="mt-4 rounded-xl bg-accent px-5 py-2 font-bold text-on-accent disabled:opacity-40">Accept terms and activate attribution</button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl bg-bg p-4">
              <p className="text-xs text-muted">Tracking status</p>
              <p className="font-semibold capitalize text-text">{partner.status}</p>
              <p className="mt-3 text-xs text-muted">Shareable referral link</p>
              <div className="mt-2 flex gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-bg/40 p-3 text-xs text-accent">{referralUrl}</code>
                <button onClick={() => navigator.clipboard.writeText(referralUrl)} aria-label="Copy referral link" className="rounded-lg border border-border-strong px-3 text-text hover:border-accent">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">Referral code: {partner.referralCode}</p>
              <p className="mt-2 text-xs text-muted">Terms {partner.termsVersion} accepted {new Date(partner.termsAcceptedAt!).toLocaleDateString()} · {partner.attributionWindowDays}-day first-touch window</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Recorded touches", metrics.touches],
                ["Active unclaimed", metrics.activeUnclaimedTouches],
                ["Attributed trials", metrics.signups],
                ["Paid customers", metrics.customers],
                ["Conversion", `${metrics.conversionRate}%`],
                ["Lifetime verified value (USD)", `$${Number(metrics.influencedRevenue).toLocaleString()}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-bg p-4">
                  <p className="text-xl font-bold text-text">{value}</p>
                  <p className="mt-1 text-xs text-muted">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">Value includes only active PayPal and Dodo payments with verified provider transaction IDs. Pending, inactive, refunded, disputed, manual, invoice-requested, and test records are excluded. Displayed value does not create a commission or payout obligation.</p>
            <div>
              <h2 className="font-bold text-text">Recent introductions</h2>
              <div className="mt-3 space-y-2">
                {partner.attributions.map((attribution) => (
                  <div key={attribution.id} className="flex items-center justify-between rounded-xl bg-bg p-3 text-sm">
                    <span className="text-muted">{new Date(attribution.createdAt).toLocaleDateString()} · {attribution.source || "partner"}</span>
                    <span className={attribution.status === "customer" ? "font-semibold text-accent" : "capitalize text-muted"}>{attribution.status}</span>
                  </div>
                ))}
                {!partner.attributions.length && <p className="text-sm text-muted">No attributed trials yet.</p>}
              </div>
            </div>
          </div>
        )}
        {notice && <p role="status" className="mt-4 text-sm text-muted">{notice}</p>}
      </div>
    </main>
  );
}
