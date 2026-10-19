"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Copy, Check, QrCode, ExternalLink, Pencil, Trash2, Pause, Play } from "lucide-react";
import type { LinkKind } from "@/lib/link-pool";

// Same base path serves DELETE and PATCH (pause/resume) for all three kinds.
const LINK_ENDPOINT: Record<LinkKind, string> = {
  rotator: "/api/rotator",
  shortlink: "/api/shortlinks",
  adlink: "/api/adlinks",
};
const DELETE_ENDPOINT = LINK_ENDPOINT;

function slugify(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "link";
}

export default function LinkRowActions({
  id,
  kind,
  name,
  publicUrl,
  editHref,
  manuallyPaused,
}: {
  id: string;
  kind: LinkKind;
  name: string;
  publicUrl: string;
  editHref: string;
  manuallyPaused: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [confirmingPause, setConfirmingPause] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState("");

  // Manual pause/resume (owner feature, distinct from the plan pause): a
  // short inline confirm before pausing (no window.confirm), no confirm
  // needed to resume.
  async function togglePause() {
    setPausing(true);
    setPauseError("");
    try {
      const res = await fetch(LINK_ENDPOINT[kind], {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paused: !manuallyPaused }),
      });
      if (!res.ok) throw new Error("Could not update this link. Please try again.");
      router.refresh();
    } catch (e) {
      setPauseError(e instanceof Error ? e.message : "Could not update this link.");
    } finally {
      setPausing(false);
      setConfirmingPause(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy was blocked. Select the link and copy it manually.");
    }
  }

  async function downloadQR() {
    try {
      const dataUrl = await QRCode.toDataURL(publicUrl, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `wazap-${slugify(name)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError("Could not create a QR code for this link.");
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(DELETE_ENDPOINT[kind], {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("The link could not be deleted. It remains in your list.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The link could not be deleted.");
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-300">Delete this link?</span>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={deleting}
          className="rounded-full bg-red-500/90 px-3 py-1.5 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (confirmingPause) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-300">Pause this link? People who click it will see a &quot;paused&quot; page.</span>
        <button
          type="button"
          onClick={togglePause}
          disabled={pausing}
          className="rounded-full bg-amber-500/90 px-3 py-1.5 font-semibold text-black hover:bg-amber-500 disabled:opacity-50"
        >
          {pausing ? "Pausing…" : "Yes, pause"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingPause(false)}
          disabled={pausing}
          className="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        title="Copy link"
        className="flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#25D366] hover:text-white"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        onClick={downloadQR}
        title="Download QR"
        className="flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#25D366] hover:text-white"
      >
        <QrCode className="h-3.5 w-3.5" />
        QR
      </button>
      <a
        href={publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Open"
        className="flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#25D366] hover:text-white"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open
      </a>
      <Link
        href={editHref}
        title="Edit"
        className="flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#25D366] hover:text-white"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Link>
      <button
        type="button"
        onClick={() => (manuallyPaused ? togglePause() : setConfirmingPause(true))}
        disabled={pausing}
        title={manuallyPaused ? "Resume" : "Pause"}
        className="flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-[#25D366] hover:text-white disabled:opacity-50"
      >
        {manuallyPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {pausing ? "Saving…" : manuallyPaused ? "Resume" : "Pause"}
      </button>
      {pauseError && <span className="text-xs text-red-400">{pauseError}</span>}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Delete"
        className="flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:border-red-500/60 hover:text-red-300"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
