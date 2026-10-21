import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Design-system guard: UI code reads colours from tokens (app/theme/tokens.css), never from literals.
 * A literal colour is only allowed in the files below, each with the reason it cannot use a CSS variable.
 * To add an exception, add the file here with a reason; prefer a token (bg-surface, text-muted, border-border ...).
 */
const ALLOW: Record<string, string> = {
  "app/theme/tokens.css": "the token definitions themselves",
  "app/opengraph-image.tsx": "ImageResponse (satori) cannot read CSS variables",
  "app/layout.tsx": "viewport themeColor must be a literal",
  "app/components/AuthShell.tsx": "SVG artwork gradients",
  "app/tools/ToolIcons.tsx": "SVG icon artwork",
  "app/qr/page.tsx": "SVG icon artwork",
  "app/qr/QRGenerator.tsx": "user-selectable QR colours",
  "app/tools/rotator/RotatorQR.tsx": "QR canvas colours",
  "app/tools/widget/page.tsx": "widget colour picker + generated embed snippet",
  "app/tools/link/page.tsx": "generated embed snippet",
  "app/links/LinkRowActions.tsx": "QR canvas colours",
  "app/links/created/CreatedActions.tsx": "QR canvas colours",
  "app/links/[type]/[id]/LinkDetailsClient.tsx": "QR canvas colours",
};

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const PALETTE = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|green|emerald|red|amber|yellow|orange|blue|purple|violet|pink|rose|sky|teal|cyan|indigo|lime|fuchsia)-\d{2,3}\b/g;
const ARBITRARY = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow)-\[#[0-9a-fA-F]{3,8}\]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api") continue; // server routes build emails/JSON, not UI
      walk(full, out);
    } else if (/\.(tsx|css)$/.test(name)) out.push(full);
  }
  return out;
}

describe("design tokens", () => {
  const root = process.cwd();
  const files = walk(path.join(root, "app")).map((f) => path.relative(root, f).split(path.sep).join("/"));

  it("has no literal colours outside the allowlist", () => {
    const problems: string[] = [];
    for (const file of files) {
      if (ALLOW[file]) continue;
      const lines = readFileSync(path.join(root, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const re of [HEX, PALETTE, ARBITRARY]) {
          const hits = line.match(re);
          if (hits) problems.push(`${file}:${i + 1}  ${[...new Set(hits)].join(", ")}`);
        }
      });
    }
    expect(problems, `Use design tokens instead (see docs/design-system.md):\n${problems.join("\n")}`).toEqual([]);
  });

  it("keeps the allowlist honest (no stale entries)", () => {
    const stale = Object.keys(ALLOW).filter((f) => !files.includes(f));
    expect(stale).toEqual([]);
  });
});
