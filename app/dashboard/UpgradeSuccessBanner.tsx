"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

const LABEL: Record<string, string> = { free: "Free trial ended", basic: "Solo", pro: "Growth", ultimate: "Agency", business: "Business" };
function paidAccess(plan: string, expiresAt: string | null, expectedPlan?: string) {
  return plan !== "free" && (!expectedPlan || plan === expectedPlan) && (!expiresAt || new Date(expiresAt).getTime() > Date.now());
}
export default function UpgradeSuccessBanner({ plan, expiresAt, expectedPlan, change }: { plan: string; expiresAt: string | null; expectedPlan?: string; change?: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  // A downgrade or a plain renewal doesn't change the plan today - it is
  // scheduled for the next billing date - so there is nothing to poll for.
  // Only an upgrade (or the original no-`change` purchase flow) waits for
  // the plan to actually match.
  const isScheduled = change === "downgrade" || change === "renew";
  const [activePlan, setActivePlan] = useState(paidAccess(plan, expiresAt, expectedPlan) ? plan : "free");
  const [waiting, setWaiting] = useState(!isScheduled);
  const activated = isScheduled || activePlan !== "free";

  useEffect(() => {
    if (isScheduled || activated) return;
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const response = await fetch('/api/billing', { cache: 'no-store' });
        const data = await response.json();
        if (stopped) return;
        if (response.ok && data.accessActive && paidAccess(data.plan, data.renewsOrExpiresAt, expectedPlan)) {
          setActivePlan(data.plan);
          router.refresh();
          return;
        }
      } catch { /* Retry briefly; do not turn an uncertain result into success. */ }
      if (stopped) return;
      if (++attempts >= 15) { setWaiting(false); return; }
      timer = setTimeout(check, 4000);
    }
    timer = setTimeout(check, 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [isScheduled, activated, expectedPlan, router]);

  if (hidden) return null;
  return <div role="status" className="relative rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-5 pr-12">
    <button onClick={() => { setHidden(true); router.replace('/dashboard'); }} aria-label="Dismiss payment status" className="absolute top-3 right-3 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
    <p className="font-bold text-white text-lg">{isScheduled ? 'Your plan change is scheduled' : activated ? `${LABEL[activePlan] || activePlan} access is active` : waiting ? 'Checking your subscription…' : 'Your subscription is still awaiting confirmation'}</p>
    <p className="text-sm text-slate-300 mt-2">{isScheduled ? <>It will apply automatically on your next billing date. Manage this anytime on the <Link href="/billing" className="underline font-semibold">billing page</Link>.</> : activated ? <>Your account has paid access. Manage renewal and cancellation on the <Link href="/billing" className="underline font-semibold">billing page</Link>.</> : waiting ? 'We are waiting for the payment provider to confirm your subscription. This page checks automatically for up to a minute.' : 'If you completed payment, please do not pay again. Check billing or contact support so we can verify your payment.'}</p>
    {!isScheduled && !activated && !waiting && <div className="mt-3 flex gap-4 text-sm text-[#25D366]"><button onClick={() => window.location.reload()}>Check again</button><Link href="/support">Get billing help →</Link></div>}
  </div>;
}
