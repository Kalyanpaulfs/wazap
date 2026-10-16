"use client";

import { useSession } from "next-auth/react";
import { ChevronDown } from "lucide-react";

// Guide under a tool. Signed-in users came to use the tool, so it starts
// collapsed for them; visitors (and search engines) get it open. The content is
// always in the HTML either way.
export default function ToolGuideSection({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const open = status === "unauthenticated";
  return (
    <details key={open ? "open" : "closed"} open={open} className="group mx-auto max-w-3xl px-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#111811] px-5 py-3 text-sm font-semibold text-white hover:border-[#25D366]/40 [&::-webkit-details-marker]:hidden">
        How it works
        <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="min-w-0 break-words pt-4">{children}</div>
    </details>
  );
}
