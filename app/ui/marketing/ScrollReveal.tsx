"use client";

import { useEffect } from "react";

/**
 * Arms scroll-reveal for every [data-animate] element on the page. Without JS (or with reduced motion)
 * nothing is hidden, so content never depends on this component.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-animate]"));
    if (!targets.length) return;
    const root = document.documentElement;
    root.classList.add("reveal-ready");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const index = Array.from(el.parentElement?.children ?? []).indexOf(el);
        el.style.transitionDelay = `${Math.min(index, 4) * 70}ms`;
        el.setAttribute("data-visible", "");
        observer.unobserve(el);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    targets.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
      targets.forEach((el) => { el.removeAttribute("data-visible"); el.style.transitionDelay = ""; });
    };
  }, []);
  return null;
}
