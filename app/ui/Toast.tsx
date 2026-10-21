"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cx } from "./cx";

type Tone = "neutral" | "success" | "danger";
type ToastItem = { id: number; message: string; tone: Tone };

const Ctx = createContext<{ toast: (message: string, tone?: Tone) => void } | null>(null);

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: Tone = "neutral") => {
    const id = nextId++;
    setItems((cur) => [...cur, { id, message, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-float",
              t.tone === "success" && "bg-accent text-on-accent",
              t.tone === "danger" && "bg-danger text-white",
              t.tone === "neutral" && "bg-ink text-white",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
