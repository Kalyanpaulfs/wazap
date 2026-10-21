import Link from "next/link";
import { AlertTriangle, ArrowRight, MessageCircle } from "lucide-react";

export const metadata = { title: "WhatsApp routing link paused", robots: { index: false, follow: false } };

export default function RouterLimitPage() {
  return (
    <main className="min-h-screen px-4 py-20">
      <section className="mx-auto max-w-xl rounded-3xl border border-warning/30 bg-surface p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-highlight-soft">
          <AlertTriangle className="h-7 w-7 text-warning" />
        </div>
        <h1 className="mt-5 text-3xl font-bold text-text">This WhatsApp link is paused</h1>
        <p className="mt-3 text-muted">Either the owner&apos;s free trial has ended, they&apos;ve used the 100 leads in their free trial, or their plan isn&apos;t active. If you manage this link, choose a plan to turn routing back on instantly.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/pricing?source=router_limit" className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-on-accent hover:bg-accent-hover">
            Choose a plan <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login?redirect=/tools/rotator" className="inline-flex items-center justify-center gap-2 rounded-full border border-border-strong px-6 py-3 text-sm font-semibold text-text hover:border-accent">
            <MessageCircle className="h-4 w-4" /> Owner login
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted">Wazap never reads message content. Routing resumes automatically after you choose a plan.</p>
      </section>
    </main>
  );
}
