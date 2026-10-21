import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Checkbox({
  label, className, ...rest
}: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className={cx("inline-flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-text", className)}>
      <input type="checkbox" className="size-5 shrink-0 cursor-pointer rounded-md accent-accent" {...rest} />
      <span>{label}</span>
    </label>
  );
}
