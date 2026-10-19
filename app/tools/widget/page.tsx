"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { MessageCircle, Copy, Check, Code } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";

export default function WidgetGeneratorPage() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const [dial, setDial] = useState("971");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("Hello! I'd like to get in touch.");
  const [position, setPosition] = useState("bottom-right");
  const [color, setColor] = useState("#25D366");
  const [size, setSize] = useState("60");
  const [label, setLabel] = useState("Chat with us");
  const [showLabel, setShowLabel] = useState(true);
  const [copied, setCopied] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tools/use?tool=widget")
      .then(r => r.ok ? r.json() : null)
      .then(d => setAvailable(Boolean(d?.available)))
      .catch(() => {});
  }, []);

  const fullNumber = dial + number.replace(/\D/g, "");
  const validNumber = /^[1-9]\d{6,14}$/.test(fullNumber) && number.trim().length > 0;
  const waUrl = message.trim()
    ? `https://wa.me/${fullNumber}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${fullNumber}`;

  const positionStyle = position === "bottom-right"
    ? "bottom:24px;right:24px;"
    : position === "bottom-left"
    ? "bottom:24px;left:24px;"
    : "top:24px;right:24px;";

  const safeLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const embedCode = `<!-- Wazap WhatsApp Widget -->
<div id="wazap-widget" style="position:fixed;${positionStyle}z-index:9999;display:flex;flex-direction:column;align-items:${position.includes("right") ? "flex-end" : "flex-start"};gap:8px;">
  ${showLabel ? `<div style="background:#1f2937;color:#fff;padding:8px 14px;border-radius:999px;font-size:13px;font-family:sans-serif;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap;">${safeLabel}</div>` : ""}
  <a aria-label="Chat on WhatsApp" href="${waUrl}" target="_blank" rel="noopener noreferrer"
    style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:${color};border-radius:50%;box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:transform 0.2s;"
    onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
    <svg width="${Math.round(parseInt(size) * 0.48)}" height="${Math.round(parseInt(size) * 0.48)}" viewBox="0 0 24 24" fill="white">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M13.5 2C7.149 2 2 7.149 2 13.5c0 2.027.54 3.927 1.483 5.565L2 22l3.094-1.455A11.43 11.43 0 0013.5 22C19.851 22 25 16.851 25 10.5S19.851 2 13.5 2z"/>
    </svg>
  </a>
  <div style="text-align:center;font-size:9px;color:#64748b;font-family:sans-serif;">
    <a href="https://wazap.lt" target="_blank" style="color:#64748b;text-decoration:none;">Powered by Wazap</a>
  </div>
</div>
<!-- End Wazap Widget -->`;

  const locked = available === false;

  async function copy() {
    setLimitError(null);
    if (!validNumber) { setLimitError("Enter a valid phone number before copying your button."); return; }
    try {
    const res = await fetch("/api/tools/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "widget", count: 1 }),
    });
    const data = await res.json();
    if (res.status === 403) { setAvailable(false); return; }
    if (!res.ok) throw new Error(data.error || "Button copy could not be completed. Please try again.");
    await navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);    } catch (error) {
      setLimitError(error instanceof Error ? error.message : "Button copy could not be completed. Please try again.");
    }
  }

  return (
    <>
      <div className="border-b border-border bg-bg/90 px-4 min-h-10 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {isLoggedIn ? (
          <Link href="/links/new" className="text-muted hover:text-text">← Create a link</Link>
        ) : (
          <Link href="/tools" className="text-muted hover:text-text">← Tools</Link>
        )}
        <span className="text-text">/</span>
        <span className="text-text font-medium">Widget Generator</span>
      </div>

      <div className="px-4 py-12">
        <div className="mx-auto max-w-5xl min-w-0">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-text mb-2">WhatsApp Widget Generator</h1>
            <p className="text-muted">Paste one line of code on your website. Visitors can chat with you on WhatsApp instantly.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Config */}
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
                <h2 className="font-semibold text-text">Your WhatsApp Number</h2>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select aria-label="Country code" value={dial} onChange={e => setDial(e.target.value)}
                    className="w-full min-w-0 rounded-xl bg-surface border border-border-strong px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent sm:w-44 sm:shrink-0">
                    {COUNTRIES.map(c => <option key={c.code} value={c.dial.replace("+","")}>{c.dial} {c.name}</option>)}
                  </select>
                  <input aria-label="Phone number" type="tel" inputMode="numeric" value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="Phone number"
                    className="w-full min-w-0 flex-1 rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Pre-filled message</label>
                  <input aria-label="Widget pre-filled message" type="text" value={message} onChange={e => setMessage(e.target.value)}
                    className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent" />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
                <h2 className="font-semibold text-text">Appearance</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted block mb-1">Position</label>
                    <select aria-label="Widget position" value={position} onChange={e => setPosition(e.target.value)}
                      className="w-full rounded-xl bg-surface border border-border-strong px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent">
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="top-right">Top Right</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Button Size (px)</label>
                    <input aria-label="Widget button size in pixels" type="number" value={size} onChange={e => setSize(e.target.value)} min="40" max="100"
                      className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-2">Button Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {["#25D366","#128C7E","#000000","#1a1a2e","#7c3aed","#dc2626","#ea580c","#0070ba"].map(c => (
                      <button aria-label={`Use widget colour ${c}`} aria-pressed={color === c} key={c} onClick={() => setColor(c)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? "border-border scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={showLabel} onChange={e => setShowLabel(e.target.checked)} className="rounded" />
                    <span className="text-sm text-muted">Show label bubble</span>
                  </label>
                  {showLabel && (
                    <input aria-label="Widget greeting label" type="text" value={label} onChange={e => setLabel(e.target.value)}
                      className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent" />
                  )}
                </div>
              </div>
            </div>

            {/* Preview + Code */}
            <div className="space-y-5">
              {/* Preview */}
              <div className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="font-semibold text-text mb-4">Preview</h2>
                <div className="relative h-48 rounded-xl bg-surface border border-border-strong overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">Your website here</div>
                  <div className={`absolute flex flex-col gap-2 ${position === "bottom-right" ? "bottom-4 right-4 items-end" : position === "bottom-left" ? "bottom-4 left-4 items-start" : "top-4 right-4 items-end"}`}>
                    {showLabel && <div className="bg-muted text-text px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap">{label}</div>}
                    <div className="rounded-full flex items-center justify-center shadow-lg" style={{ width: `${Math.min(parseInt(size), 52)}px`, height: `${Math.min(parseInt(size), 52)}px`, backgroundColor: color }}>
                      <MessageCircle className="text-text" style={{ width: `${Math.min(parseInt(size), 52) * 0.48}px`, height: `${Math.min(parseInt(size), 52) * 0.48}px` }} />
                    </div>
                    <div className="text-muted text-xs">Powered by Wazap</div>
                  </div>
                </div>
              </div>

              {/* Embed code */}
              <div className="rounded-2xl border border-border bg-surface p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-accent" />
                    <h2 className="font-semibold text-text">Embed Code</h2>
                  </div>
                  <button onClick={copy} disabled={locked || !validNumber}
                    className="flex items-center gap-1.5 rounded-full border border-border-strong hover:border-accent px-3 py-1.5 text-xs text-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : locked ? "Paid plans" : "Copy"}
                  </button>
                </div>
                {locked ? (
                  <div className="rounded-xl bg-surface p-4 text-sm text-muted">
                    The website button is included in Solo, Growth and Agency.{" "}
                    <Link href={isLoggedIn ? "/billing#plans" : "/pricing?source=widget"} className="font-semibold text-accent underline">See plans</Link>
                  </div>
                ) : (
                  <pre className="text-xs text-muted bg-surface rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono">{embedCode}</pre>
                )}
                {limitError && (
                  <p className="text-xs text-danger mt-2">{limitError}</p>
                )}
                <p className="text-xs text-muted mt-3">Paste this anywhere before <code className="text-muted">&lt;/body&gt;</code> on your website.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
