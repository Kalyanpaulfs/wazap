"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

/** Next tab index for an arrow/Home/End key, or null if the key is not handled. */
export function nextTabIndex(key: string, current: number, count: number, rtl = false): number | null {
  const step = rtl ? -1 : 1;
  if (key === "ArrowRight") return (current + step + count) % count;
  if (key === "ArrowLeft") return (current - step + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export type TabItem = { id: string; label: string; content: ReactNode };

export function Tabs({ tabs, defaultId }: { tabs: TabItem[]; defaultId?: string }) {
  const base = useId();
  const [active, setActive] = useState(defaultId ?? tabs[0]?.id);
  const index = Math.max(0, tabs.findIndex((t) => t.id === active));

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const next = nextTabIndex(e.key, index, tabs.length, rtl);
    if (next === null) return;
    e.preventDefault();
    setActive(tabs[next].id);
    document.getElementById(`${base}-tab-${tabs[next].id}`)?.focus();
  }

  return (
    <div>
      <div role="tablist" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              id={`${base}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={cx(
                "-mb-px min-h-11 border-b-2 px-4 text-[15px] font-medium transition-colors duration-200",
                selected ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`${base}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          className="pt-5"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
