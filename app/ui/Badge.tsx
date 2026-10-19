import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "highlight" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent-hover",
  highlight: "bg-highlight-soft text-warning",
  success: "bg-accent-soft text-success",
  warning: "bg-highlight-soft text-warning",
  danger: "bg-danger/10 text-danger",
};

export function Badge({ tone = "neutral", className, ...rest }: { tone?: BadgeTone } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}
      {...rest}
    />
  );
}
