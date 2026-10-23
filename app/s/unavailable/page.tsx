import Link from "next/link";
import { AlertTriangle, Flag } from "lucide-react";

export const metadata = { title: "Link unavailable", robots: { index: false, follow: false } };

// Friendly landing for a disabled or unknown /s/<code> link-shortener code
// (TOOL-FREE-2). Matches the visual style of app/link-paused/page.tsx so
// "this link doesn't work" looks the same everywhere on the site.
export default async function ShortUrlUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; code?: string }>;
}) {
  const { reason, code } = await searchParams;
  const disabled = reason === "disabled";

  return (
    <main className="hero-bg min-h-screen px-4 py-20">
      <section className="mx-auto max-w-xl rounded-3xl border border-amber-400/30 bg-[#101710] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10">
          <AlertTriangle className="h-7 w-7 text-amber-300" />
        </div>
        <h1 className="mt-5 text-3xl font-bold text-white">{disabled ? "This link was disabled" : "Link not found"}</h1>
        <p className="mt-3 text-slate-400">
          {disabled
            ? "This short link was disabled after being reported, or by its owner."
            : "This short link doesn't exist, or it has been deleted."}
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black hover:bg-[#1fba58]">
            Go to wazap.lt
          </Link>
          {disabled && code && (
            <Link
              href={`/s/${encodeURIComponent(code)}/report`}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-white hover:border-[#25D366]"
            >
              <Flag className="h-4 w-4" /> Report a problem
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
