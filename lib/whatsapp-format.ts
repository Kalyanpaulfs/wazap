// Helpers for the free WhatsApp Text Formatter (app/tools/formatter).
// The editor shows real bold/italic/... (no symbols); these pure functions
// turn the editor's styled text into WhatsApp symbols for copying, and
// WhatsApp symbols back into styled pieces for the preview / pasting.
// Unit tested in tests/whatsapp-format.test.ts.

/** A piece of editor text with the styles applied to it. */
export type StyledRun = { text: string; bold?: boolean; italic?: boolean; strike?: boolean; mono?: boolean };

const sameStyle = (a: StyledRun, b: StyledRun) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.strike === !!b.strike && !!a.mono === !!b.mono;

/**
 * Turns styled editor text into a WhatsApp message: *bold*, _italic_,
 * ~strikethrough~, ```monospace```. Spaces at the edges stay outside the
 * symbols and every line is wrapped on its own, because WhatsApp only applies
 * a style when the symbols touch the words and sit on the same line.
 */
export function runsToWhatsApp(runs: StyledRun[]): string {
  const merged: StyledRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = merged[merged.length - 1];
    if (last && sameStyle(last, run)) last.text += run.text;
    else merged.push({ ...run });
  }
  let out = "";
  for (const run of merged) {
    const open = (run.bold ? "*" : "") + (run.italic ? "_" : "") + (run.strike ? "~" : "") + (run.mono ? "```" : "");
    if (!open) { out += run.text; continue; }
    const close = open.split("").reverse().join("");
    out += run.text.split("\n").map(line => {
      const m = line.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      return m[2] ? m[1] + open + m[2] + close + m[3] : line;
    }).join("\n");
  }
  return out.replace(/\n+$/, "");
}

// ---- Reading WhatsApp symbols: preview + pasting into the editor ----

export type PreviewNode =
  | { type: "text"; value: string }
  | { type: "bold" | "italic" | "strike"; children: PreviewNode[] }
  | { type: "mono"; value: string };

const STYLE: Record<"*" | "_" | "~", "bold" | "italic" | "strike"> = { "*": "bold", "_": "italic", "~": "strike" };

/**
 * Parses WhatsApp formatting into a tree. A mark only counts when it has a
 * matching closing mark (same line for * _ ~; monospace may span lines) and
 * the words inside are not empty. Unmatched symbols stay as text.
 * Styles can be nested, e.g. *_bold italic_*.
 */
export function parseWhatsApp(text: string): PreviewNode[] {
  const nodes: PreviewNode[] = [];
  let buf = "";
  const flush = () => { if (buf) { nodes.push({ type: "text", value: buf }); buf = ""; } };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const close = text.indexOf("```", i + 3);
      if (close > i + 3) {
        flush();
        nodes.push({ type: "mono", value: text.slice(i + 3, close) });
        i = close + 3;
        continue;
      }
    }
    const ch = text[i];
    if (ch === "*" || ch === "_" || ch === "~") {
      const lineEnd = text.indexOf("\n", i);
      const limit = lineEnd === -1 ? text.length : lineEnd;
      const close = text.indexOf(ch, i + 1);
      if (close > i + 1 && close < limit) {
        flush();
        nodes.push({ type: STYLE[ch], children: parseWhatsApp(text.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return nodes;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/**
 * HTML for the editor when someone pastes a message that already has
 * WhatsApp symbols: the symbols become real styles. Uses the same tags the
 * browser's own Bold/Italic/Strikethrough/font commands create.
 */
export function whatsAppToEditorHtml(text: string): string {
  const render = (nodes: PreviewNode[]): string => nodes.map(n => {
    if (n.type === "text") return escapeHtml(n.value).replace(/\n/g, "<br>");
    if (n.type === "mono") return `<font face="monospace">${escapeHtml(n.value).replace(/\n/g, "<br>")}</font>`;
    const tag = n.type === "bold" ? "b" : n.type === "italic" ? "i" : "strike";
    return `<${tag}>${render(n.children)}</${tag}>`;
  }).join("");
  return render(parseWhatsApp(text));
}
