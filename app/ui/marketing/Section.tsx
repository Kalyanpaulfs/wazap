import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export function Container({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)} {...rest} />;
}

export function Section({
  tone = "bg", className, children, ...rest
}: { tone?: "bg" | "surface" } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("py-20 sm:py-28", tone === "surface" && "border-y border-border bg-surface", className)} {...rest}>
      {children}
    </section>
  );
}

/**
 * Eyebrow + two-line heading. Renders `title<br/><span>highlight</span>` so translated text nodes
 * keep the same shape as the original page.
 */
export function SectionHeader({
  eyebrow, title, highlight, children, align = "center", className,
}: { eyebrow: ReactNode; title: ReactNode; highlight?: ReactNode; children?: ReactNode; align?: "center" | "start"; className?: string }) {
  return (
    <div className={cx("max-w-2xl", align === "center" ? "mx-auto text-center" : "text-start", className)} data-animate>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight text-text sm:text-5xl">
        {title}
        {highlight && (<><br /><span className="text-gradient-brand">{highlight}</span></>)}
      </h2>
      {children && <p className="mt-5 text-lg leading-8 text-muted">{children}</p>}
    </div>
  );
}
