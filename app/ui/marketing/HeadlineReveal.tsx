import { cx } from "../cx";

/**
 * Hero headline with a line-by-line entrance. The entrance is pure CSS (`.hl-line` in theme/utilities.css),
 * so the text is painted immediately: no JavaScript sits between the user and the largest paint.
 * `accentLine` gets the brand gradient.
 */
export function HeadlineReveal({ lines, accentLine, className }: { lines: string[]; accentLine?: number; className?: string }) {
  return (
    <h1 className={cx("text-5xl font-bold leading-[1.06] tracking-tight text-text sm:text-6xl lg:text-[3.4rem] xl:text-[3.9rem]", className)}>
      {lines.map((line, i) => (
        <span key={line} className="block overflow-hidden pb-1">
          <span className={cx("hl-line block", i === accentLine && "text-gradient-brand")} style={{ "--i": i } as React.CSSProperties}>{line}</span>
        </span>
      ))}
    </h1>
  );
}
