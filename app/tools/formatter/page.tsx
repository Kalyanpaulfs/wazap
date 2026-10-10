"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bold, Italic, Strikethrough, Code, Copy, Check, Crown } from "lucide-react";

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}
function renderPreview(text: string) {
  let h = escapeHtml(text);
  h = h.replace(/```([\s\S]+?)```/g, '<code style="background:#0b141a;padding:1px 4px;border-radius:4px;font-family:monospace">$1</code>');
  h = h.replace(/(^|\s)\*(\S(?:.*?\S)?)\*(?=\s|$)/g, '$1<b>$2</b>');
  h = h.replace(/(^|\s)_(\S(?:.*?\S)?)_(?=\s|$)/g, '$1<i>$2</i>');
  h = h.replace(/(^|\s)~(\S(?:.*?\S)?)~(?=\s|$)/g, '$1<s>$2</s>');
  return h.replace(/\n/g, "<br/>");
}

export default function FormatterPage() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("Type here, select some words, then tap *B* / _i_ / ~S~ / mono above.");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [plan, setPlan] = useState("free");
  const [freeUsed, setFreeUsed] = useState(false);

  useEffect(() => {
    fetch("/api/tools/use?tool=checker").then(r => r.ok ? r.json() : null).then(d => { if (d?.plan) setPlan(d.plan); }).catch(() => {});
    try { setFreeUsed(!!localStorage.getItem("wazap_formatter_used")); } catch {}
  }, []);

  const paid = ["basic", "pro", "ultimate", "business"].includes(plan);
  const canCopy = paid || !freeUsed;

  function wrap(mark: string, endMark = mark) {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = text.slice(s, e) || "text";
    const next = text.slice(0, s) + mark + sel + endMark + text.slice(e);
    setText(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + mark.length, s + mark.length + sel.length); }, 0);
  }
  async function copy() {
    if (!canCopy) return;
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
        setCopyError("Copy was blocked by your browser. Select the text above and copy it manually.");
        return;
      }
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
    if (!paid) { try { localStorage.setItem("wazap_formatter_used", "1"); } catch {} setFreeUsed(true); }
  }

  const Tool = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 hover:border-[#25D366] bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:text-white transition-colors">{icon}<span>{label}</span></button>
  );

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Text Formatter</span>
        {!paid && <span className="ml-auto inline-flex items-center gap-1 text-xs text-yellow-400"><Crown className="h-3 w-3" /> 1 free copy · then paid</span>}
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">WhatsApp Text Formatter</h1>
            <p className="text-slate-400">Make your WhatsApp messages stand out with <b>bold</b>, <i>italic</i>, <s>strikethrough</s> and monospace — no need to remember the symbols.</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Tool icon={<Bold className="h-4 w-4" />} label="Bold" onClick={() => wrap("*")} />
              <Tool icon={<Italic className="h-4 w-4" />} label="Italic" onClick={() => wrap("_")} />
              <Tool icon={<Strikethrough className="h-4 w-4" />} label="Strikethrough" onClick={() => wrap("~")} />
              <Tool icon={<Code className="h-4 w-4" />} label="Monospace" onClick={() => wrap("```")} />
            </div>
            <label htmlFor="formatter-message" className="block text-sm font-medium text-slate-300">Your message</label>
            <textarea id="formatter-message" ref={ref} value={text} onChange={e => setText(e.target.value)} rows={6}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] resize-none" />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b141a] p-5">
            <div className="text-xs text-slate-500 mb-2">Preview</div>
            <div className="text-[15px] text-slate-100 leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: renderPreview(text) }} />
          </div>

          {canCopy ? (
            <div className="space-y-2">
              <button onClick={copy} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] py-3 text-sm font-bold text-black transition-colors">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied — paste into WhatsApp" : "Copy formatted text"}
              </button>
              {copyError && <p role="alert" className="text-center text-sm text-red-400">{copyError}</p>}
            </div>
          ) : (
            <div className="text-center space-y-2">
              <p className="text-sm text-slate-400">You&apos;ve used your free copy. Upgrade for unlimited formatting.</p>
              <Link href="/pricing" className="inline-block rounded-full bg-[#25D366] hover:bg-[#1fba58] px-8 py-3 text-sm font-bold text-black transition-colors">Upgrade →</Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
