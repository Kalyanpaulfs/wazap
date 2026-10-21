"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "./cx";
import { IconButton } from "./Button";

/**
 * Dialog built on the native <dialog>: focus trapping, Escape and inert background come from the browser.
 * placement="side" turns it into a drawer.
 */
export function Modal({
  open, onClose, title, children, placement = "center",
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; placement?: "center" | "side" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl border border-border bg-surface p-0 text-text shadow-float backdrop:bg-ink/45 backdrop:backdrop-blur-sm",
        placement === "side" && "me-0 ms-auto mt-0 h-dvh max-h-none w-[min(26rem,100vw)] rounded-none rounded-s-3xl",
      )}
    >
      <div className="flex items-start justify-between gap-4 p-6 pb-2">
        <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
        <IconButton label="Close" onClick={onClose} className="-me-2 -mt-2"><X className="size-5" aria-hidden /></IconButton>
      </div>
      <div className="p-6 pt-2">{children}</div>
    </dialog>
  );
}
