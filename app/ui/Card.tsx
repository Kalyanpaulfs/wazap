import type { ElementType, HTMLAttributes } from "react";
import { cx } from "./cx";

export function Card({
  as: Tag = "div", variant = "default", className, ...rest
}: { as?: ElementType; variant?: "default" | "glass" | "flat" } & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cx(
        variant === "default" && "surface-card",
        variant === "glass" && "glass",
        variant === "flat" && "rounded-3xl bg-surface-2",
        "p-6",
        className,
      )}
      {...rest}
    />
  );
}
