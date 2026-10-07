"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // SiteVisit is a traffic-session metric, not a page-view counter. Recording
    // every route made internal audits look like hundreds of independent leads.
    const key = `wazap:visit:v2:${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const params = new URLSearchParams(window.location.search);
    const stored = (() => {
      try { return JSON.parse(sessionStorage.getItem("wazap:attribution") || "{}") as Record<string, string>; }
      catch { return {}; }
    })();
    const suppliedPartnerCode = (params.get("partner") || params.get("ref") || params.get("partnerCode") || "").trim().toLowerCase();
    const partnerCode = /^wz-[a-f0-9]{10}$/.test(suppliedPartnerCode) ? suppliedPartnerCode : "";
    const attribution = {
      source: stored.source || params.get("utm_source") || "",
      medium: stored.medium || params.get("utm_medium") || "",
      campaign: stored.campaign || params.get("utm_campaign") || "",
      content: stored.content || params.get("utm_content") || "",
      term: stored.term || params.get("utm_term") || "",
      gclid: stored.gclid || params.get("gclid") || "",
      landingPage: stored.landingPage || pathname,
    };
    if (attribution.source || attribution.gclid) {
      sessionStorage.setItem("wazap:attribution", JSON.stringify({ ...stored, ...attribution }));
    }
    if (partnerCode) void fetch("/api/partner-attribution/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partnerCode, source: attribution.source || "partner", landingPage: attribution.landingPage }), keepalive: true });
    void fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        language: navigator.language || "en",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        referrer: document.referrer || "direct",
        source: attribution.source || undefined,
      }),
      keepalive: true,
    });
  }, [pathname]);

  return null;
}
