"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";

interface Props {
  value: string;
  onChange: (dial: string) => void;
}

export default function CountryPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = COUNTRIES.find(c => c.dial === value) ?? COUNTRIES[0];

  const filtered = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search)
      )
    : COUNTRIES;

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 100);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setSearch("");
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-surface border border-border-strong px-3 py-3 text-sm text-text focus:outline-none focus:border-accent cursor-pointer shrink-0 hover:border-accent transition-colors min-w-[80px]"
      >
        <span className="font-medium">{selected.dial}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" />
      </button>

      {/* Mobile bottom sheet / desktop dropdown */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="relative w-full sm:max-w-sm bg-surface border border-border-strong sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-muted" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-text">Select Country</span>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-text p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search country or code..."
                  className="w-full rounded-xl bg-surface border border-border-strong pl-9 pr-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {filtered.map(c => (
                <button
                  key={c.code}
                  onClick={() => { onChange(c.dial); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors text-left ${c.dial === value ? "bg-accent-soft" : ""}`}
                >
                  <span className={`text-sm ${c.dial === value ? "text-accent font-semibold" : "text-text"}`}>{c.name}</span>
                  <span className={`text-sm font-mono ${c.dial === value ? "text-accent" : "text-muted"}`}>{c.dial}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-muted text-sm py-8">No countries found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
