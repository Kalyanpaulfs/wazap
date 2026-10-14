"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const WORDING = "Get early access to new features and member-only offers?";

// FEAT-CONSENT: shown only when app/dashboard/page.tsx decides the user has
// not yet answered (lib/marketing-consent#shouldShowConsentBanner). Yes and
// No thanks are the same size/style - no dark patterns - and either answer
// is saved server-side so the banner never reappears.
export default function DashboardConsentBanner({ initialShow }: { initialShow: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState(initialShow);
  const [busy, setBusy] = useState(false);

  if (!show) return null;

  async function respond(wanted: boolean) {
    setBusy(true);
    try {
      await fetch("/api/dashboard/marketing-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wanted }),
      });
    } catch {
      // Hide anyway; worst case the banner can reappear on a later visit.
    } finally {
      setShow(false);
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#111811] p-4">
      <p className="text-sm text-white">{WORDING}</p>
      <div className="flex shrink-0 gap-3">
        <button type="button" disabled={busy} onClick={() => respond(true)} className="rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#1fba58] disabled:opacity-50">
          Yes
        </button>
        <button type="button" disabled={busy} onClick={() => respond(false)} className="rounded-full border border-slate-700 px-4 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 disabled:opacity-50">
          No thanks
        </button>
      </div>
    </div>
  );
}
