"use client";

import { useEffect } from "react";

export default function PricingViewTracker() {
  useEffect(() => {
    const key = "wazap:pricing-view:session";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const params = new URLSearchParams(window.location.search);
    const source = params.get("utm_source") || params.get("source") || document.referrer || "direct";
    void fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "pricing_view", source: source.slice(0, 100) }),
      keepalive: true,
    });
  }, []);

  return null;
}
