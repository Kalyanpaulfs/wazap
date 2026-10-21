"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bold, Italic, Strikethrough, Code, Copy, Check } from "lucide-react";
import { parseWhatsApp, runsToWhatsApp, whatsAppToEditorHtml, type PreviewNode, type StyledRun } from "@/lib/whatsapp-format";

// Free tool (copied from the old codex/crm-payment-sync-20261011 branch):
// formatting, preview and copy all happen in the browser - nothing is sent
// or stored, and copies are unlimited for everyone (no login, no plan).
// The message box shows real bold/italic/... with no symbols; the WhatsApp
// symbols (*bold* _italic_ ~strike~ ```mono```) are only added on copy.

type Style = "bold" | "italic" | "strike" | "mono";
type Active = Record<Style, boolean>;
const NONE: Active = { bold: false, italic: false, strike: false, mono: false };
const MONO_FONT = /\bmono(space)?\b|courier|consolas/i;

// The font set directly on this element, if any (the innermost one wins,
// so turning Monospace off inside monospace text works).
function ownFont(el: HTMLElement): string | null {
  if (el.tagName === "FONT" && el.getAttribute("face")) return el.getAttribute("face");
  return el.style.fontFamily || null;
}

// Reads the editor's styled text (browser formatting tags) into runs.
function readRuns(root: HTMLElement): StyledRun[] {
  const runs: StyledRun[] = [];
  const walk = (node: Node, style: Omit<StyledRun, "text">) => {
    if (node.nodeType === Node.TEXT_NODE) { runs.push({ text: node.textContent ?? "", ...style }); return; }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") { runs.push({ text: "\n" }); return; }
    // Each new line in the editor is a <div>/<p>.
    if ((node.tagName === "DIV" || node.tagName === "P") && node !== root && runs.length && !runs[runs.length - 1].text.endsWith("\n")) runs.push({ text: "\n" });
    const tag = node.tagName, css = node.style;
    const next = {
      bold: style.bold || tag === "B" || tag === "STRONG" || css.fontWeight === "bold" || Number(css.fontWeight) >= 600,
      italic: style.italic || tag === "I" || tag === "EM" || css.fontStyle === "italic",
      strike: style.strike || tag === "S" || tag === "STRIKE" || tag === "DEL" || css.textDecoration.includes("line-through"),
      mono: ownFont(node) !== null ? MONO_FONT.test(ownFont(node)!) : style.mono || tag === "CODE",
    };
    node.childNodes.forEach(child => walk(child, next));
  };
  walk(root, {});
  return runs;
}

function isMonoAt(node: Node | null, root: HTMLElement) {
  for (let n = node; n && n !== root; n = n.parentNode) {
    if (!(n instanceof HTMLElement)) continue;
    const font = ownFont(n);
    if (font !== null) return MONO_FONT.test(font);
    if (n.tagName === "CODE") return true;
  }
  return false;
}

// Preview shows the styles only - the symbols are hidden.
function Preview({ nodes }: { nodes: PreviewNode[] }) {
  return <>{nodes.map((n, i) => {
    if (n.type === "text") return <Fragment key={i}>{n.value}</Fragment>;
    if (n.type === "mono") return <code key={i} className="rounded bg-surface-2 px-1 font-mono">{n.value}</code>;
    const Tag = n.type === "bold" ? "b" : n.type === "italic" ? "i" : "s";
    return <Tag key={i}><Preview nodes={n.children} /></Tag>;
  })}</>;
}

// Defined outside the page so React keeps the SAME button between renders
// (an inline component is re-created every render, which swallowed clicks).
function StyleButton({ icon, label, on, onClick }: { icon: React.ReactNode; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick} title={on ? `Remove ${label.toLowerCase()}` : label} aria-label={label} aria-pressed={on}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm transition-colors ${on ? "border-accent bg-accent/20 font-semibold text-text shadow-hairline" : "border-border bg-surface-2 text-text hover:border-accent hover:text-text"}`}>{icon}<span>{label}</span></button>
  );
}

export default function FormatterPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [active, setActive] = useState<Active>(NONE);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const sync = useCallback(() => {
    const el = ref.current; if (!el) return;
    setText(runsToWhatsApp(readRuns(el)));
  }, []);

  // Buttons light up when the cursor/selection is inside that style.
  const updateActive = useCallback(() => {
    const el = ref.current, selection = document.getSelection();
    if (!el || !selection?.rangeCount || !el.contains(selection.anchorNode)) return;
    const next: Active = {
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      strike: document.queryCommandState("strikeThrough"),
      mono: isMonoAt(selection.anchorNode, el),
    };
    setActive(prev => (prev.bold === next.bold && prev.italic === next.italic && prev.strike === next.strike && prev.mono === next.mono ? prev : next));
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", updateActive);
    return () => document.removeEventListener("selectionchange", updateActive);
  }, [updateActive]);

  // Click once to add the style, click again to remove it.
  function toggle(style: Style) {
    const el = ref.current; if (!el) return;
    el.focus();
    document.execCommand("styleWithCSS", false, "false");
    if (style === "mono") {
      document.execCommand("fontName", false, active.mono ? getComputedStyle(el).fontFamily : "monospace");
    } else {
      document.execCommand(style === "strike" ? "strikeThrough" : style);
    }
    sync();
    updateActive();
  }

  // Pasted text arrives without outside formatting; WhatsApp symbols in it become real styles.
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    document.execCommand("insertHTML", false, whatsAppToEditorHtml(e.clipboardData.getData("text/plain")));
    sync();
  }

  async function copy() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      const didCopy = document.execCommand("copy");
      fallback.remove();
      if (!didCopy) {
        setCopyError("Copy was blocked by your browser. Please try again.");
        return;
      }
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="wp-subbar border-b border-border bg-bg/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-muted hover:text-text">← Tools</Link>
        <span className="text-border-strong">/</span>
        <span className="text-text font-medium">Text Formatter</span>
        <span className="ml-auto text-xs text-accent">Free · unlimited</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-text mb-2">WhatsApp Text Formatter</h1>
            <p className="text-muted">Make your WhatsApp messages stand out with <b>bold</b>, <i>italic</i>, <s>strikethrough</s> and monospace — no need to remember the symbols.</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <StyleButton icon={<Bold className="h-4 w-4" />} label="Bold" on={active.bold} onClick={() => toggle("bold")} />
              <StyleButton icon={<Italic className="h-4 w-4" />} label="Italic" on={active.italic} onClick={() => toggle("italic")} />
              <StyleButton icon={<Strikethrough className="h-4 w-4" />} label="Strikethrough" on={active.strike} onClick={() => toggle("strike")} />
              <StyleButton icon={<Code className="h-4 w-4" />} label="Monospace" on={active.mono} onClick={() => toggle("mono")} />
            </div>
            <div id="formatter-label" className="block text-sm font-medium text-text">Your message</div>
            <div className="relative">
              {!text && <div aria-hidden className="pointer-events-none absolute left-4 top-3 text-sm text-muted">Type your message, select some words, then tap Bold, Italic, Strikethrough or Monospace.</div>}
              <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby="formatter-label"
                onInput={() => { sync(); updateActive(); }} onPaste={onPaste} onKeyUp={updateActive} onMouseUp={updateActive}
                className="min-h-36 w-full whitespace-pre-wrap break-words rounded-xl bg-surface-2 border border-border px-4 py-3 text-sm text-text focus:outline-none focus:border-accent" />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-2 p-5">
            <div className="text-xs text-muted mb-2">Preview</div>
            <div className="text-[15px] text-text leading-relaxed break-words whitespace-pre-wrap"><Preview nodes={parseWhatsApp(text)} /></div>
          </div>

          <div className="space-y-2">
            <button onClick={copy} disabled={!text} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent py-3 text-sm font-bold text-on-accent transition-colors">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied — paste into WhatsApp" : "Copy formatted text"}
            </button>
            {copyError && <p role="alert" className="text-center text-sm text-danger">{copyError}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
