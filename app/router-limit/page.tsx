import Link from "next/link";
import { AlertTriangle, ArrowRight, MessageCircle } from "lucide-react";

export const metadata = { title: "WhatsApp routing link paused | Wazap", robots: { index: false, follow: false } };

export default function RouterLimitPage() {
  return (
    <main className="hero-bg min-h-screen px-4 py-20">
      <section className="mx-auto max-w-xl rounded-3xl border border-amber-400/30 bg-[#101710] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10">
          <AlertTriangle className="h-7 w-7 text-amber-300" />
        </div>
        <h1 className="mt-5 text-3xl font-bold text-white">This WhatsApp link is paused</h1>
        <p className="mt-3 text-slate-400">The owner&apos;s Wazap free trial has ended or their plan isn&apos;t active. If you manage this link, choose a plan to turn routing back on instantly.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/pricing?source=router_limit" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black hover:bg-[#1fba58]">
            Choose a plan <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login?redirect=/tools/rotator" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-white hover:border-[#25D366]">
            <MessageCircle className="h-4 w-4" /> Owner login
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-600">Wazap never reads message content. Routing resumes automatically after you choose a plan.</p>
      </section>
    </main>
  );
}
