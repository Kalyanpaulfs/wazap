"use client";
import { useEffect, useState } from "react";
import { QrCode, Download } from "lucide-react";
import QRCode from "qrcode";

function slugify(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "qr";
}

export default function RotatorQR({ url, name }: { url: string; name: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // Resetting state for the new url being synchronized by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataUrl(null);
    setError("");

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("Could not create a QR code for this link.");
        return;
      }
    } catch {
      setError("Could not create a QR code for this link.");
      return;
    }

    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(result => { if (!cancelled) setDataUrl(result); })
      .catch(() => { if (!cancelled) setError("Could not create a QR code for this link."); });

    return () => { cancelled = true; };
  }, [url]);

  function download() {
    if (!dataUrl) return;
    try {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `wazap-router-${slugify(name)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError("Download failed. Please try again.");
    }
  }

  return (
    <div className="mt-4 flex flex-col sm:flex-row items-center gap-4 rounded-xl bg-slate-900 p-3">
      {dataUrl ? (
        <img src={dataUrl} alt={`QR code for ${name}`} className="h-32 w-32 rounded bg-white" />
      ) : (
        <div className="h-32 w-32 flex items-center justify-center rounded bg-white text-center">
          {error ? (
            <QrCode className="h-6 w-6 text-slate-300" />
          ) : (
            <span className="text-xs text-slate-500">Generating QR…</span>
          )}
        </div>
      )}
      <div className="text-center sm:text-left">
        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : (
          <p className="text-xs text-slate-400">Scan to open this router link</p>
        )}
        <button type="button" onClick={download} disabled={!dataUrl}
          className="mt-2 flex items-center gap-1.5 rounded-full border border-slate-700 hover:border-[#25D366] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors disabled:opacity-50">
          <Download className="h-3.5 w-3.5" />
          Download QR Code
        </button>
      </div>
    </div>
  );
}
