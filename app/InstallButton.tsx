"use client";
import { useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS() {
  return typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(window as any).MSStream;
}

function isInStandaloneMode() {
  return typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

export default function InstallButton({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) { setInstalled(true); return; }

    if (isIOS()) {
      setIos(true);
      return;
    }

    const handler = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }

  if (installed) {
    return (
      <div className={`flex items-center gap-2 rounded-full border border-[#25D366]/30 px-4 py-2 text-xs text-[#25D366] ${className}`}>
        <Smartphone className="h-3.5 w-3.5" /> App installed
      </div>
    );
  }

  // iOS — show button that opens step-by-step guide
  if (ios) {
    return (
      <>
        <button onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-2 rounded-full border border-[#25D366]/40 hover:border-[#25D366] px-4 py-2 text-xs text-slate-300 hover:text-white transition-colors ${className}`}>
          <Download className="h-3.5 w-3.5 text-[#25D366]" /> Install App
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowIOSGuide(false)}>
            <div className="w-full rounded-t-3xl border-t border-[#25D366]/20 bg-[#0d1a0d]/98 backdrop-blur-md px-5 pt-4 pb-10 shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-4" />
              <button onClick={() => setShowIOSGuide(false)} className="absolute top-4 right-5 text-slate-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <img src="/icon-192.png" alt="Wazap" className="w-12 h-12 rounded-2xl" />
                <div>
                  <p className="font-bold text-white">Install Wazap</p>
                  <p className="text-xs text-slate-400">Free · Works offline</p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { step: 1, content: <span>Tap the <Share className="h-4 w-4 inline text-blue-400 mx-0.5" /> <span className="text-blue-400 font-medium">Share</span> button at the bottom of Safari</span> },
                  { step: 2, content: <span>Scroll down and tap <span className="text-white font-medium">"Add to Home Screen"</span></span> },
                  { step: 3, content: <span>Tap <span className="text-white font-medium">"Add"</span> — you're done!</span> },
                ].map(({ step, content }) => (
                  <div key={step} className="flex items-center gap-3 rounded-xl bg-slate-800/60 px-4 py-3">
                    <div className="w-7 h-7 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-[#25D366]">{step}</span>
                    </div>
                    <p className="text-sm text-slate-200">{content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Android/Chrome — native install
  if (!prompt) return null;

  return (
    <button onClick={install}
      className={`flex items-center gap-2 rounded-full border border-[#25D366]/40 hover:border-[#25D366] px-4 py-2 text-xs text-slate-300 hover:text-white transition-colors ${className}`}>
      <Download className="h-3.5 w-3.5 text-[#25D366]" /> Install App
    </button>
  );
}
