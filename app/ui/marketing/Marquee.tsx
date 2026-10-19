import type { ReactNode } from "react";

/** Slow looping strip. Animation is CSS-only, pauses on hover and is disabled by prefers-reduced-motion. */
export function Marquee({ items, label }: { items: { icon: ReactNode; text: string }[]; label: string }) {
  return (
    <div role="region" aria-label={label} className="marquee overflow-hidden border-y border-border bg-surface py-4">
      <div className="marquee-track flex w-max" aria-hidden="true">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {items.map((item) => (
              <span key={item.text} className="mx-6 inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-muted">
                <span className="text-accent">{item.icon}</span>{item.text}
                <i className="ms-6 size-1 rounded-full bg-border-strong" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
