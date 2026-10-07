"use client";

import { useState, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Copy, Check, QrCode, Lock } from "lucide-react";
import Link from "next/link";
import CountryPicker from "@/app/CountryPicker";

interface Props {
  status: "guest" | "trial_active" | "trial_expired" | "paid";
  qrLimit: number | null;
  qrUsed: number;
}

export default function QRGenerator({ status, qrLimit, qrUsed: initialUsed }: Props) {
  const [dial, setDial] = useState("+971");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [color, setColor] = useState("#25D366");
  const [copied, setCopied] = useState(false);
  const [qrUsed, setQrUsed] = useState(initialUsed);
  const [blocked, setBlocked] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const clean = number.replace(/\D/g, "");
  const fullNumber = clean ? `${dial.replace("+", "")}${clean}` : "";
  const waUrl = fullNumber
    ? message.trim()
      ? `https://wa.me/${fullNumber}?text=${encodeURIComponent(message.trim())}`
      : `https://wa.me/${fullNumber}`
    : "";

  const copyLink = useCallback(() => {
    if (!waUrl) return;
    navigator.clipboard.writeText(waUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [waUrl]);

  async function downloadQR() {
    if (!waUrl || !qrRef.current) return;

    if (status === "guest" || status === "trial_expired") {
      setBlocked(true);
      return;
    }

    if (qrLimit !== null && qrUsed >= qrLimit) {
      setBlocked(true);
      return;
    }

    const res = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "qr" }),
    });

    if (!res.ok) { setBlocked(true); return; }

    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const link = document.createElement("a");
      link.download = `wazap-qr-${fullNumber}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setQrUsed(n => n + 1);
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  }

  const qrRemaining = qrLimit !== null ? Math.max(0, qrLimit - qrUsed) : null;
  const atLimit = qrLimit !== null && qrUsed >= qrLimit;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
      {/* Input side */}
      <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <QrCode className="h-5 w-5 text-[#25D366]" />
          <span className="font-semibold text-white">Your WhatsApp Details</span>
        </div>

        <div className="flex gap-2">
          <CountryPicker value={dial} onChange={setDial} />
          <input type="tel" inputMode="numeric" value={number} onChange={e => setNumber(e.target.value)} placeholder="Your phone number"
            className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] transition-colors" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Pre-filled message (optional)</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Hi! I'd like to get in touch..." rows={3}
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] transition-colors resize-none" />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2">QR colour</label>
          <div className="flex gap-3 flex-wrap">
            {["#25D366", "#128C7E", "#000000", "#1a1a2e", "#7c3aed", "#dc2626"].map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? "border-white scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        {waUrl && (
          <div className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 flex items-center gap-2">
            <span className="text-xs text-slate-400 truncate flex-1 font-mono">{waUrl}</span>
            <button onClick={copyLink} className="shrink-0 text-slate-400 hover:text-[#25D366] transition-colors">
              {copied ? <Check className="h-4 w-4 text-[#25D366]" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>

      {/* QR preview side */}
      <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 flex flex-col items-center justify-center">
        {waUrl ? (
          <>
            <div ref={qrRef} className="bg-white p-4 rounded-2xl mb-6 shadow-lg shadow-green-900/20">
              <QRCodeSVG value={waUrl} size={220} fgColor={color} bgColor="#ffffff" level="H" includeMargin={false} />
            </div>
            <p className="text-sm text-slate-400 text-center mb-1">Scan with any camera to open WhatsApp</p>

            {qrRemaining !== null && (
              <p className="text-xs text-slate-600 mb-4">{qrRemaining} download{qrRemaining !== 1 ? "s" : ""} remaining today</p>
            )}
            {qrRemaining === null && <p className="text-xs text-slate-600 mb-4">Unlimited downloads</p>}

            <button onClick={downloadQR} disabled={!waUrl || atLimit}
              className="flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2.5 text-sm font-semibold text-black transition-colors">
              <Download className="h-4 w-4" /> Download PNG
            </button>

            {atLimit && (status === "trial_active" || status === "paid") && (
              <p className="text-xs text-amber-400 mt-3 text-center">
                Daily limit reached — <Link href="/pricing" className="underline">upgrade your plan</Link> for higher limits.
              </p>
            )}
          </>
        ) : (
          <div className="text-center">
            <div className="w-40 h-40 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center mx-auto mb-4">
              <QrCode className="h-16 w-16 text-slate-700" />
            </div>
            <p className="text-slate-500 text-sm">Enter your phone number<br />to generate a QR code</p>
            {status === "guest" && (
              <p className="text-xs text-slate-600 mt-2">
                <Link href="/signup?redirect=/qr" className="text-[#25D366] hover:underline">Sign up free</Link> for a 30-day trial
              </p>
            )}
            {status === "trial_expired" && (
              <p className="text-xs text-amber-400 mt-2">
                Trial ended — <Link href="/pricing" className="underline">upgrade to download</Link>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Guest gate modal */}
      {blocked && status === "guest" && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setBlocked(false)}>
          <div className="rounded-2xl border border-[#25D366]/30 bg-[#111811] p-8 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <Lock className="h-10 w-10 text-[#25D366] mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Free account required</h3>
            <p className="text-slate-400 text-sm mb-6">Create a free account and get a 30-day trial with QR downloads included.</p>
            <Link href="/signup?redirect=/qr" className="block w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] py-3 text-sm font-bold text-black transition-colors mb-3">
              Sign Up Free — 30-Day Trial
            </Link>
            <Link href="/login?redirect=/qr" className="block text-sm text-slate-500 hover:text-slate-300">Already have an account? Sign in</Link>
          </div>
        </div>
      )}

      {/* Trial expired modal */}
      {blocked && status === "trial_expired" && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setBlocked(false)}>
          <div className="rounded-2xl border border-amber-500/30 bg-[#111811] p-8 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <Lock className="h-10 w-10 text-amber-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Free trial ended</h3>
            <p className="text-slate-400 text-sm mb-6">Your 30-day free trial has expired. Upgrade to keep downloading QR codes.</p>
            <Link href="/pricing" className="block w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] py-3 text-sm font-bold text-black transition-colors mb-3">
              View Plans
            </Link>
            <button onClick={() => setBlocked(false)} className="text-sm text-slate-500 hover:text-slate-300">Maybe later</button>
          </div>
        </div>
      )}

      {/* Daily limit modal */}
      {blocked && (status === "trial_active" || status === "paid") && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setBlocked(false)}>
          <div className="rounded-2xl border border-[#25D366]/30 bg-[#111811] p-8 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <Lock className="h-10 w-10 text-[#25D366] mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Daily limit reached</h3>
            <p className="text-slate-400 text-sm mb-6">You&apos;ve used all your QR downloads for today. Upgrade your plan for higher daily limits.</p>
            <Link href="/pricing" onClick={() => setBlocked(false)} className="block w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] py-3 text-sm font-bold text-black transition-colors mb-3">
              Upgrade Plan
            </Link>
            <button onClick={() => setBlocked(false)} className="text-sm text-slate-500 hover:text-slate-300">Maybe later</button>
          </div>
        </div>
      )}
    </div>
  );
}
