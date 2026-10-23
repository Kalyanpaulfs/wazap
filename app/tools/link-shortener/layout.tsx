import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

const description = "Shorten any website link for free. Paste a URL, get a short link with a QR code and click counts. Sign in to create one - it only takes a moment.";
export const metadata: Metadata = {
  title: "Free Link Shortener — Shorten Any Website URL",
  description,
  alternates: { canonical: "https://wazap.lt/tools/link-shortener" },
  openGraph: { title: "Free Link Shortener | Wazap", description, url: "https://wazap.lt/tools/link-shortener" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToolSeo k="link-shortener">
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white">Frequently asked questions</h2>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <p className="font-semibold text-white">Is this only for WhatsApp links?</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">No - this tool shortens any website address. For a link that opens WhatsApp, use the WhatsApp link tool instead.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <p className="font-semibold text-white">Is it really free?</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">Yes, free and unlimited within fair-use limits (20 new links per account per day), on every plan, including free accounts.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <p className="font-semibold text-white">What links are blocked?</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Raw IP addresses, local addresses, links with a username or password, other link shorteners (to stop a link hiding its real destination) and
                any link Google Safe Browsing flags as unsafe.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <p className="font-semibold text-white">Found a short link that looks unsafe?</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Open the link, then use its <a className="text-[#25D366] hover:underline" href="/s/unavailable">Report a problem</a> link, or go straight to a
                link&apos;s <code className="rounded bg-slate-900 px-1">/report</code> page (for example <code className="rounded bg-slate-900 px-1">/s/abc1234/report</code>). A link is disabled automatically after 3 reports.
              </p>
            </div>
          </div>
        </div>
      </ToolSeo>
    </>
  );
}
