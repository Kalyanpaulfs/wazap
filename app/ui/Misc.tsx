import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cx("animate-pulse rounded-xl bg-border", className)} {...rest} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-border", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-border-strong bg-surface-2 px-1.5 py-0.5 font-sans text-xs font-medium text-muted">
      {children}
    </kbd>
  );
}

export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cx("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-premium)]" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Initials avatar. Shows the first letters of up to two words. */
export function initials(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0]);
  return letters.join("").toUpperCase() || "?";
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cx("inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-hover", className)}
    >
      {initials(name)}
    </span>
  );
}

/** Selectable pill used for filters. */
export function Chip({
  selected, className, children, ...rest
}: { selected?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        "btn-press min-h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-200",
        selected ? "border-accent bg-accent-soft text-accent-hover" : "border-border-strong bg-surface text-muted hover:text-text",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** CSS-only tooltip; text is wired to the trigger with aria-describedby. */
export function Tooltip({ text, id, children }: { text: string; id: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute start-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-float transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 rtl:translate-x-1/2"
      >
        {text}
      </span>
    </span>
  );
}
