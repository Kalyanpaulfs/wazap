"use client";
import { useEffect, useRef, useState, type RefObject } from "react";

export function useMotion(root: RefObject<HTMLElement | null>, paused: boolean) {
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState(false);
  const played = useRef(new WeakSet<Element>());
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    update(); visibility();
    media.addEventListener("change", update); document.addEventListener("visibilitychange", visibility);
    return () => { media.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  const enabled = !paused && !reduced;
  useEffect(() => { root.current?.setAttribute("data-background", hidden ? "true" : "false"); }, [hidden, root]);
  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;
    const animations: Animation[] = [];
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || played.current.has(entry.target)) return;
        played.current.add(entry.target);
        const target = entry.target as HTMLElement;
        const siblings = target.parentElement?.children;
        const index = siblings ? Array.from(siblings).indexOf(target) : 0;
        animations.push(target.animate([
          { opacity: 0, translate: "0 26px", filter: "blur(3px)" },
          { opacity: 1, translate: "0 0", filter: "blur(0px)" },
        ], { duration: 780, delay: Math.min(index * 65, 195), easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }));
        observer.unobserve(target);
      });
    }, { threshold: .12 });
    el.querySelectorAll(".wz-section-heading h2,.wz-demo-copy,.wz-step,.wz-feature,.wz-industry-layout>div:first-child,.wz-industry-panel,.wz-faq-layout>div,.wz-final").forEach(target => {
      if (!played.current.has(target)) observer.observe(target);
    });
    let frame = 0;
    const render = () => {
      frame = 0;
      const hero = el.querySelector<HTMLElement>(".wz-hero");
      const steps = el.querySelector<HTMLElement>(".wz-steps-section");
      if (hero) {
        const box = hero.getBoundingClientRect();
        el.style.setProperty("--hero-scroll", `${Math.max(-90, Math.min(0, box.top * .12))}px`);
      }
      if (steps) {
        const box = steps.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (innerHeight * .85 - box.top) / (innerHeight * .65)));
        steps.style.setProperty("--path-progress", String(progress));
      }
    };
    const request = () => { if (!frame) frame = requestAnimationFrame(render); };
    addEventListener("scroll", request, { passive: true }); addEventListener("resize", request); request();
    const stage = el.querySelector<HTMLElement>(".wz-hero-stage");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const pointer = (event: PointerEvent) => {
      if (!stage || !fine.matches) return;
      const box = stage.getBoundingClientRect();
      stage.style.setProperty("--pointer-x", `${((event.clientX - box.left) / box.width - .5) * 16}px`);
      stage.style.setProperty("--pointer-y", `${((event.clientY - box.top) / box.height - .5) * 12}px`);
      stage.style.setProperty("--pointer-tilt", `${((event.clientX - box.left) / box.width - .5) * 5}deg`);
    };
    const reset = () => { stage?.style.setProperty("--pointer-x", "0px"); stage?.style.setProperty("--pointer-y", "0px"); stage?.style.setProperty("--pointer-tilt", "0deg"); };
    stage?.addEventListener("pointermove", pointer); stage?.addEventListener("pointerleave", reset);
    return () => { observer.disconnect(); animations.forEach(a => a.cancel()); cancelAnimationFrame(frame); removeEventListener("scroll", request); removeEventListener("resize", request); stage?.removeEventListener("pointermove", pointer); stage?.removeEventListener("pointerleave", reset); reset(); el.style.removeProperty("--hero-scroll"); };
  }, [enabled, root]);
  return { enabled, reduced };
}
