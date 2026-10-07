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
        className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm text-white focus:outline-none focus:border-[#25D366] cursor-pointer shrink-0 hover:border-[#25D366] transition-colors min-w-[80px]"
      >
        <span className="font-medium">{selected.dial}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
      </button>

      {/* Mobile bottom sheet / desktop dropdown */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="relative w-full sm:max-w-sm bg-[#111811] border border-slate-700 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="font-semibold text-white">Select Country</span>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search country or code..."
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
                />
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {filtered.map(c => (
                <button
                  key={c.code}
                  onClick={() => { onChange(c.dial); setOpen(false); }}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition-colors text-left ${c.dial === value ? "bg-[#25D366]/10" : ""}`}
                >
                  <span className={`text-sm ${c.dial === value ? "text-[#25D366] font-semibold" : "text-white"}`}>{c.name}</span>
                  <span className={`text-sm font-mono ${c.dial === value ? "text-[#25D366]" : "text-slate-400"}`}>{c.dial}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-8">No countries found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
