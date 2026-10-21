"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "./theme-script";

type Preference = "light" | "dark" | "auto";

const options: { value: Preference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "auto", label: "Match system theme", Icon: Monitor },
  { value: "dark", label: "Dark theme", Icon: Moon },
];

function apply(preference: Preference, animate: boolean) {
  const root = document.documentElement;
  const dark = preference === "dark" || (preference === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 300);
  }
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.setAttribute("data-theme-pref", preference);
}

/** Light / Auto / Dark switch. "Auto" follows the operating system and updates live when it changes. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [preference, setPreference] = useState<Preference>("auto");

  useEffect(() => {
    const saved = document.documentElement.getAttribute("data-theme-pref");
    setPreference(saved === "light" || saved === "dark" ? saved : "auto");
  }, []);

  useEffect(() => {
    if (preference !== "auto") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("auto", true);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  function choose(next: Preference) {
    setPreference(next);
    try {
      if (next === "auto") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    apply(next, true);
  }

  return (
    <div role="radiogroup" aria-label="Color theme" data-index={options.findIndex(o => o.value === preference)} className={`inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-2 p-0.5 ${className}`}>
      <span className="wp-theme-thumb" aria-hidden />
      {options.map(({ value, label, Icon }, index) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            style={{ "--i": index } as React.CSSProperties}
            onClick={() => choose(value)}
            className={`grid size-8 place-items-center rounded-full transition-all duration-200 pointer-coarse:size-11 ${selected ? "bg-surface text-text shadow-hairline" : "text-muted hover:bg-surface/60 hover:text-text"}`}
          >
            <Icon size={14} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
