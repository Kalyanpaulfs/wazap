"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, Download, MessageCircle, ExternalLink } from "lucide-react";

function slugify(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "link";
}

export default function CreatedActions({
  publicUrl,
  name,
  testNote,
}: {
  publicUrl: string;
  name: string;
  testNote: string;
}) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(publicUrl, { width: 480, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not create a QR code for this link.");
      });
    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy was blocked. Select the link and copy it manually.");
    }
  }

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `wazap-${slugify(name)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const shareUrl = `https://wa.me/?text=${encodeURIComponent(publicUrl)}`;

  return (
    <div className="space-y-4">
      {qrDataUrl && (
        <img src={qrDataUrl} alt={`QR code for ${name}`} className="mx-auto h-40 w-40 rounded-xl border border-border bg-surface p-2" />
      )}

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-4 py-2 text-sm font-semibold text-text hover:border-accent hover:text-text"
        >
          {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={downloadQR}
          disabled={!qrDataUrl}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-4 py-2 text-sm font-semibold text-text hover:border-accent hover:text-text disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Download QR
        </button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-4 py-2 text-sm font-semibold text-text hover:border-accent hover:text-text"
        >
          <MessageCircle className="h-4 w-4" />
          Share on WhatsApp
        </a>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:bg-accent-hover"
        >
          <ExternalLink className="h-4 w-4" />
          Test it now
        </a>
      </div>

      <p className="text-xs text-muted">{testNote}</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
