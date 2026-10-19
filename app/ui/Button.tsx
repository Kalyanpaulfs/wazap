import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "inverse" | "inverseOutline";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "btn-press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary: "btn-shine bg-accent text-on-accent shadow-accent hover:bg-accent-hover",
  secondary: "bg-surface-2 text-text hover:bg-border",
  outline: "border border-border-strong bg-surface text-text hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
  /** For dark (ink) sections. */
  inverse: "bg-white text-ink hover:bg-white/90",
  inverseOutline: "border border-white/30 text-white hover:bg-white/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-4 text-sm",
  md: "min-h-11 px-5 text-[15px]",
  lg: "min-h-12 px-7 text-base",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cx(base, variants[variant], sizes[size], className);
}

type CommonProps = { variant?: ButtonVariant; size?: ButtonSize; children?: ReactNode };

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: CommonProps & { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** Same look as Button, rendered as a link. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/** Square icon-only button. `label` is required so it always has an accessible name. */
export function IconButton({
  label,
  variant = "ghost",
  className,
  children,
  type = "button",
  ...rest
}: { label: string; variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(base, variants[variant], "size-11 shrink-0 p-0", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
