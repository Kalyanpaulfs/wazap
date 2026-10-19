"use client";

import { useRouter } from "next/navigation";
import type { LinkOption } from "@/lib/reports-data";

/**
 * The "All links ▾" filter dropdown. A plain client component (not
 * useSearchParams-based, so it needs no Suspense boundary) - the server page
 * hands it the other query params to preserve verbatim when it navigates.
 */
export default function LinkFilterSelect({
  options,
  value,
  params,
}: {
  options: LinkOption[];
  value: string;
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const qs = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val) qs.set(key, val);
    }
    if (e.target.value) qs.set("link", e.target.value);
    router.push(qs.toString() ? `/results?${qs.toString()}` : "/results");
  }

  const grouped = new Map<string, LinkOption[]>();
  for (const option of options) {
    const list = grouped.get(option.typeLabel) ?? [];
    list.push(option);
    grouped.set(option.typeLabel, list);
  }

  return (
    <select
      value={value}
      onChange={onChange}
      aria-label="Filter by link"
      className="rounded-full border border-slate-700 bg-slate-950 px-4 py-1.5 text-sm font-semibold text-slate-200 hover:border-slate-500 focus:outline-none focus:border-[#25D366] [color-scheme:dark]"
    >
      <option value="">All links</option>
      {[...grouped.entries()].map(([typeLabel, opts]) => (
        <optgroup key={typeLabel} label={typeLabel}>
          {opts.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
