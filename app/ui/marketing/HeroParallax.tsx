"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Subtle pointer parallax for hero art. GSAP is imported lazily on the first pointer movement
 * (fine pointers only), so it never costs anything during page load.
 */
export function HeroParallax({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let cleanup: (() => void) | undefined;
    let started = false;
    const start = async (first: PointerEvent) => {
      if (started) return;
      started = true;
      const { gsap } = await import("gsap");
      const moveX = gsap.quickTo(el, "x", { duration: 0.7, ease: "power3.out" });
      const moveY = gsap.quickTo(el, "y", { duration: 0.7, ease: "power3.out" });
      const tilt = gsap.quickTo(el, "rotation", { duration: 0.9, ease: "power3.out" });
      const onMove = (e: PointerEvent) => {
        const nx = e.clientX / innerWidth - 0.5;
        const ny = e.clientY / innerHeight - 0.5;
        moveX(nx * 22); moveY(ny * 16); tilt(nx * 2.2);
      };
      onMove(first);
      window.addEventListener("pointermove", onMove, { passive: true });
      cleanup = () => { window.removeEventListener("pointermove", onMove); gsap.killTweensOf(el); gsap.set(el, { clearProps: "transform" }); };
    };
    window.addEventListener("pointermove", start, { once: true, passive: true });
    return () => { window.removeEventListener("pointermove", start); cleanup?.(); };
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
