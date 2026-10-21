"use client";
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
}

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("pwa-dismissed")) return;
    if (isInStandaloneMode()) return;

    if (isIOS()) {
      // Show iOS guide after 3s so it doesn't feel jarring on page load
      const t = setTimeout(() => setShowIOS(true), 3000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => dismiss());
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") dismiss();
    setPrompt(null);
  }

  function dismiss() {
    setDismissed(true);
    setShowIOS(false);
    setPrompt(null);
    localStorage.setItem("pwa-dismissed", "1");
  }

  if (dismissed) return null;

  // Android / Chrome — native install banner
  if (prompt) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
        <div className="rounded-2xl border border-accent/30 bg-surface-2/95 backdrop-blur-md shadow-2xl px-4 py-3 flex items-center gap-3">
          <img src="/icon-192.png" alt="Wazap" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text leading-tight">Install Wazap</p>
            <p className="text-xs text-muted">Add to home screen for quick access</p>
          </div>
          <button onClick={install}
            className="rounded-full bg-accent hover:bg-accent-hover px-3 py-1.5 text-xs font-bold text-on-accent transition-colors shrink-0">
            Install
          </button>
          <button onClick={dismiss} className="text-muted hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // iOS Safari — step-by-step guide
  if (showIOS) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50">
        {/* Backdrop */}
        <div className="absolute inset-0 -top-full bg-bg/40" onClick={dismiss} />
        <div className="relative rounded-t-3xl border-t border-accent/20 bg-surface-2/98 backdrop-blur-md px-5 pt-4 pb-8 shadow-2xl">
          {/* Handle bar */}
          <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />

          <button onClick={dismiss} className="absolute top-4 right-4 text-muted hover:text-text">
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <img src="/icon-192.png" alt="Wazap" className="w-12 h-12 rounded-2xl" />
            <div>
              <p className="font-bold text-text">Install Wazap</p>
              <p className="text-xs text-muted">Free · Works offline</p>
            </div>
          </div>

          <p className="text-sm text-muted mb-4">Add Wazap to your home screen for one-tap access:</p>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-accent">1</span>
              </div>
              <p className="text-sm text-text">
                Tap the <Share className="h-4 w-4 inline text-info mx-0.5" /> <span className="text-info font-medium">Share</span> button at the bottom of Safari
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-accent">2</span>
              </div>
              <p className="text-sm text-text">
                Scroll down and tap <span className="text-text font-medium">"Add to Home Screen"</span>
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-accent">3</span>
              </div>
              <p className="text-sm text-text">
                Tap <span className="text-text font-medium">"Add"</span> — done!
              </p>
            </div>
          </div>

          {/* Arrow pointing to share button */}
          <div className="mt-4 text-center">
            <p className="text-xs text-muted">Look for the <Share className="h-3.5 w-3.5 inline text-info" /> icon in Safari's toolbar</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
