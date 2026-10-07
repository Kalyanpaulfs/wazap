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
        <div className="rounded-2xl border border-[#25D366]/30 bg-[#0d1a0d]/95 backdrop-blur-md shadow-2xl px-4 py-3 flex items-center gap-3">
          <img src="/icon-192.png" alt="Wazap" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">Install Wazap</p>
            <p className="text-xs text-slate-400">Add to home screen for quick access</p>
          </div>
          <button onClick={install}
            className="rounded-full bg-[#25D366] hover:bg-[#1fba58] px-3 py-1.5 text-xs font-bold text-black transition-colors shrink-0">
            Install
          </button>
          <button onClick={dismiss} className="text-slate-500 hover:text-white">
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
        <div className="absolute inset-0 -top-full bg-black/40" onClick={dismiss} />
        <div className="relative rounded-t-3xl border-t border-[#25D366]/20 bg-[#0d1a0d]/98 backdrop-blur-md px-5 pt-4 pb-8 shadow-2xl">
          {/* Handle bar */}
          <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-4" />

          <button onClick={dismiss} className="absolute top-4 right-4 text-slate-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <img src="/icon-192.png" alt="Wazap" className="w-12 h-12 rounded-2xl" />
            <div>
              <p className="font-bold text-white">Install Wazap</p>
              <p className="text-xs text-slate-400">Free · Works offline</p>
            </div>
          </div>

          <p className="text-sm text-slate-300 mb-4">Add Wazap to your home screen for one-tap access:</p>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-[#25D366]">1</span>
              </div>
              <p className="text-sm text-slate-200">
                Tap the <Share className="h-4 w-4 inline text-blue-400 mx-0.5" /> <span className="text-blue-400 font-medium">Share</span> button at the bottom of Safari
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-[#25D366]">2</span>
              </div>
              <p className="text-sm text-slate-200">
                Scroll down and tap <span className="text-white font-medium">"Add to Home Screen"</span>
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-[#25D366]">3</span>
              </div>
              <p className="text-sm text-slate-200">
                Tap <span className="text-white font-medium">"Add"</span> — done!
              </p>
            </div>
          </div>

          {/* Arrow pointing to share button */}
          <div className="mt-4 text-center">
            <p className="text-xs text-slate-500">Look for the <Share className="h-3.5 w-3.5 inline text-blue-400" /> icon in Safari's toolbar</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
