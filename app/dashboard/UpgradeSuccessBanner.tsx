"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

const LABEL: Record<string, string> = { free: "", basic: "Solo", pro: "Growth", ultimate: "Team", business: "Business" };

export default function UpgradeSuccessBanner({ plan }: { plan: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const activated = plan !== "free";

  useEffect(() => {
    // The payment webhook can land a couple seconds after the redirect —
    // if the plan hasn't flipped yet, refresh once to pick up activation.
    if (!activated) {
      const t = setTimeout(() => router.refresh(), 4000);
      return () => clearTimeout(t);
    }
  }, [activated, router]);

  useEffect(() => {
    if (!activated) return;
    const eventKey = `wazap:subscription-activated:${plan}`;
    if (sessionStorage.getItem(eventKey)) return;
    window.gtag?.("event", "subscription_activated", { plan, currency: "USD" });
    sessionStorage.setItem(eventKey, "1");
  }, [activated, plan]);

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    router.replace("/dashboard");
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#25D366]/40 bg-gradient-to-r from-[#25D366]/20 to-[#25D366]/5 p-5">
      <button onClick={dismiss} aria-label="Dismiss" className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-3">
        <div className="text-3xl">🎉</div>
        <div>
          {activated ? (
            <>
              <p className="font-bold text-white text-lg">You&apos;re now on {LABEL[plan]}!</p>
              <p className="text-sm text-slate-300 mt-0.5">
                Payment successful — your {LABEL[plan]} plan is active for the next 30 days. Enjoy every tool.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-white text-lg">Payment received — activating your plan…</p>
              <p className="text-sm text-slate-300 mt-0.5">
                This usually takes a few seconds. The page will refresh automatically.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
