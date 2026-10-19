import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

export const metadata = { title: "Link paused | Wazap", robots: { index: false, follow: false } };

// Shared paused page for every public link/page type (rotator, short link,
// ad link). Two distinct reasons land here:
// - planPausedAt (default / reason=plan): the owner's free trial ended, or
//   their current plan doesn't include this link - upgrade pitch applies.
// - pausedAt (reason=owner, manual pause feature): the owner paused this
//   link themselves on purpose. No upgrade pitch - there's nothing to buy.
// Matches the visual style of app/router-limit/page.tsx so pausing doesn't
// invent a second look-and-feel for "this link is off."
export default async function LinkPausedPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; reason?: string }>;
}) {
  const { reason } = await searchParams;

  if (reason === "owner") {
    return (
      <main className="hero-bg min-h-screen px-4 py-20">
        <section className="mx-auto max-w-xl rounded-3xl border border-amber-400/30 bg-[#101710] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10">
            <AlertTriangle className="h-7 w-7 text-amber-300" />
          </div>
          <h1 className="mt-5 text-3xl font-bold text-white">This link is paused</h1>
          <p className="mt-3 text-slate-400">This link is paused by its owner.</p>
          <div className="mt-7 flex justify-center">
            <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-white hover:border-[#25D366]">
              Owner login
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="hero-bg min-h-screen px-4 py-20">
      <section className="mx-auto max-w-xl rounded-3xl border border-amber-400/30 bg-[#101710] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10">
          <AlertTriangle className="h-7 w-7 text-amber-300" />
        </div>
        <h1 className="mt-5 text-3xl font-bold text-white">This link is paused</h1>
        <p className="mt-3 text-slate-400">This link was paused because the owner&apos;s free trial ended, or their plan doesn&apos;t include it. If you manage it, choose a plan to turn it back on instantly.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/pricing?source=plan_limit_pause" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black hover:bg-[#1fba58]">
            Choose a plan <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-white hover:border-[#25D366]">
            Owner login
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-600">Nothing was deleted. Choosing a plan turns this back on automatically.</p>
      </section>
    </main>
  );
}
