import Link from "next/link";
import { ArrowRight, Lock, Sparkles, type LucideIcon } from "lucide-react";
import type { ToolCard as ToolCardData } from "@/lib/tool-catalog";

// Shared premium-dark card used by both app/links/new (Create a link) and
// app/tools (All tools) for every tool card - keep both pages visually in
// sync by editing this one component instead of duplicating markup.
export function ToolCardLink({ card, Icon }: { card: ToolCardData; Icon: LucideIcon }) {
  return (
    <Link
      href={card.href}
      aria-disabled={card.locked ? "true" : undefined}
      className={`group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 ${card.locked ? "opacity-60" : ""}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent transition-transform duration-200 group-hover:scale-105">
        {card.locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text">{card.name}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-muted">{card.locked ? card.description : card.question}</span>
      </span>
      {!card.locked && <ArrowRight className="ms-auto h-4 w-4 shrink-0 -translate-x-1 text-muted opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100 rtl:rotate-180" aria-hidden />}
    </Link>
  );
}

// "More free tools coming soon" placeholder - dashed border, same spot the
// Free tools section has always had one. Render this only while the real
// free-tool count is still small (see call sites) so it disappears on its
// own once the catalog grows past it - no flag to keep in sync by hand.
export function ToolComingSoonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-surface p-5 opacity-70">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
        <Sparkles className="h-5 w-5" />
      </span>
      <div>
        <p className="mt-1 font-bold text-muted">More free tools coming soon</p>
      </div>
      <p className="text-xs text-muted">We&apos;re building more. Nothing to do here yet.</p>
    </div>
  );
}
