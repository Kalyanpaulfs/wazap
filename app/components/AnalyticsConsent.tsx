"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// "loading" = saved choice not read yet. The banner stays hidden until then,
// otherwise it flashes on every refresh for people who already chose (BUG-14).
type Consent = "loading" | "unknown" | "accepted" | "rejected";

declare global {
  interface Window {
    dataLayer: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

const STORAGE_KEY = "wazap_analytics_consent";
const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

function initialiseAnalytics() {
  if (!MEASUREMENT_ID) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag ||= (...args: unknown[]) => window.dataLayer.push(args);
  if (document.querySelector(`script[data-wazap-ga="${MEASUREMENT_ID}"]`)) return;
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    cookie_flags: "SameSite=None;Secure",
    send_page_view: false,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.dataset.wazapGa = MEASUREMENT_ID;
  document.head.appendChild(script);
}

export default function AnalyticsConsent() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const firstPageViewSent = useRef(false);
  const [consent, setConsent] = useState<Consent>("loading");

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
    if (stored === "accepted") {
      setConsent("accepted");
      initialiseAnalytics();
    } else if (stored === "rejected") {
      setConsent("rejected");
    } else {
      setConsent("unknown");
    }
  }, []);

  useEffect(() => {
    if (!MEASUREMENT_ID || !window.gtag) return;
    if (!firstPageViewSent.current || previousPath.current !== pathname) {
      window.gtag("event", "page_view", {
        page_path: pathname,
        page_location: window.location.href,
        page_title: document.title,
      });
      firstPageViewSent.current = true;
      previousPath.current = pathname;
    }
  }, [consent, pathname]);

  const choose = (choice: Exclude<Consent, "loading" | "unknown">) => {
    try { localStorage.setItem(STORAGE_KEY, choice); } catch {}
    setConsent(choice);
    if (choice === "accepted") initialiseAnalytics();
    window.gtag?.("consent", "update", {
      analytics_storage: choice === "accepted" ? "granted" : "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  };

  if (!MEASUREMENT_ID || consent !== "unknown") return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-[#111811]/95 p-4 shadow-2xl backdrop-blur-md sm:flex sm:items-center sm:gap-5" aria-label="Analytics preferences">
      <p className="text-sm leading-6 text-slate-300 sm:flex-1">
        Wazap uses optional Google Analytics cookies to understand traffic and improve its tools. No phone numbers or message content are sent to Google. Read our <Link href="/cookie" className="text-[#25D366] hover:underline">cookie policy</Link>.
      </p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <button type="button" onClick={() => choose("rejected")} className="rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:border-slate-400">Reject</button>
        <button type="button" onClick={() => choose("accepted")} className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-black hover:bg-[#1fba58]">Accept analytics</button>
      </div>
    </aside>
  );
}
