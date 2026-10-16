"use client";

import { useState, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Copy, Check, QrCode } from "lucide-react";
import CountryPicker from "@/app/CountryPicker";

interface Props {
  // Logged-in users get a lightweight (best-effort, non-blocking) usage
  // count recorded for analytics. Everyone — guests included — can always
  // generate and download a QR code: no daily caps, no trial gate.
  isLoggedIn: boolean;
}

export default function QRGenerator({ isLoggedIn }: Props) {
  const [dial, setDial] = useState("+971");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [color, setColor] = useState("#25D366");
  const [copied, setCopied] = useState(false);
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

    // Best-effort analytics only — never blocks the download.
    if (isLoggedIn) {
      fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "qr" }),
      }).catch(() => {});
    }

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
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  }

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
            <p className="text-xs text-slate-600 mb-4">Unlimited downloads — free for everyone</p>

            <button onClick={downloadQR} disabled={!waUrl}
              className="flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2.5 text-sm font-semibold text-black transition-colors">
              <Download className="h-4 w-4" /> Download PNG
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="w-40 h-40 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center mx-auto mb-4">
              <QrCode className="h-16 w-16 text-slate-700" />
            </div>
            <p className="text-slate-500 text-sm">Enter your phone number<br />to generate a QR code</p>
          </div>
        )}
      </div>
    </div>
  );
}
