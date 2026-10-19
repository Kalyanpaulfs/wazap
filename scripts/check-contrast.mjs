/* global console, process, URL */
// Verifies WCAG AA contrast for the semantic color pairs in app/theme/tokens.css.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/theme/tokens.css", import.meta.url), "utf8");
const tok = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum ratio]
const pairs = [
  ["text", "bg", 4.5], ["text", "surface", 4.5], ["text", "surface-2", 4.5],
  ["muted", "bg", 4.5], ["muted", "surface", 4.5], ["muted", "surface-2", 4.5],
  ["on-accent", "accent", 4.5], ["on-accent", "accent-hover", 4.5],
  ["accent-hover", "surface", 4.5], ["accent-hover", "accent-soft", 4.5],
  ["success", "surface", 4.5], ["danger", "surface", 4.5], ["info", "surface", 4.5],
  ["warning", "surface", 4.5], ["warning", "highlight-soft", 4.5],
  ["accent", "surface", 4.5], ["accent", "bg", 4.5],
  ["highlight", "ink", 3],
];

let failed = 0;
for (const [fg, bg, min] of pairs) {
  const r = ratio(tok[fg], tok[bg]);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${fg} on ${bg}: ${r.toFixed(2)} (min ${min})`);
}
process.exit(failed ? 1 : 0);
