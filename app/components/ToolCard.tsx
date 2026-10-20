import Link from "next/link";
import { Lock, Sparkles, type LucideIcon } from "lucide-react";
import type { ToolCard as ToolCardData } from "@/lib/tool-catalog";

// Shared premium-dark card used by both app/links/new (Create a link) and
// app/tools (All tools) for every tool card - keep both pages visually in
// sync by editing this one component instead of duplicating markup.
export function ToolCardLink({ card, Icon }: { card: ToolCardData; Icon: LucideIcon }) {
  return (
    <Link
      href={card.href}
      aria-disabled={card.locked ? "true" : undefined}
      className={`flex flex-col gap-3 rounded-2xl border p-5 ${
        card.locked ? "border-slate-800 bg-[#0d130e] opacity-70" : "border-slate-800 bg-[#111811] hover:border-[#25D366]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-[#25D366]">
          {card.locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        {!card.locked && card.badge && (
          <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-xs font-semibold text-[#25D366]">
            {card.badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm text-slate-400">{card.question}</p>
        <p className="mt-1 font-bold text-white">{card.name}</p>
      </div>
      <p className="text-xs text-slate-500">{card.description}</p>
      {!card.locked && card.note && <p className="text-xs text-slate-600">{card.note}</p>}
    </Link>
  );
}

// "More free tools coming soon" placeholder - dashed border, same spot the
// Free tools section has always had one. Render this only while the real
// free-tool count is still small (see call sites) so it disappears on its
// own once the catalog grows past it - no flag to keep in sync by hand.
export function ToolComingSoonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-800 bg-[#0d130e] p-5 opacity-70">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-500">
        <Sparkles className="h-5 w-5" />
      </span>
      <div>
        <p className="mt-1 font-bold text-slate-400">More free tools coming soon</p>
      </div>
      <p className="text-xs text-slate-500">We&apos;re building more. Nothing to do here yet.</p>
    </div>
  );
}
