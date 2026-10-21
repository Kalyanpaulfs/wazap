"use client";

import { cx } from "./cx";

export function Switch({
  checked, onChange, label, disabled,
}: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 min-w-11 items-center justify-center disabled:opacity-50"
    >
      <span className={cx("relative h-6 w-11 rounded-full transition-colors duration-200", checked ? "bg-accent" : "bg-border-strong")}>
        <span
          className={cx(
            "absolute start-0.5 top-0.5 size-5 rounded-full bg-white shadow-raise transition-transform duration-200 ease-[var(--ease-spring)]",
            checked && "translate-x-5 rtl:-translate-x-5",
          )}
        />
      </span>
    </button>
  );
}
