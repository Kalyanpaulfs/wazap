"use client";
// FEAT-QUEUE: Settings tab - speed limit, daily cap, and the team's default
// country (used to complete phone numbers with no country code on both
// member and customer-list CSV imports).
import { useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import type { OutreachTeamData } from "./types";

export default function SettingsTab({ team, onTeamChange }: { team: OutreachTeamData; onTeamChange: (update: (prev: OutreachTeamData) => OutreachTeamData) => void }) {
  const [speedLimitSeconds, setSpeedLimitSeconds] = useState(String(team.speedLimitSeconds));
  const [dailyCap, setDailyCap] = useState(team.dailyCap != null ? String(team.dailyCap) : "");
  const [defaultCountry, setDefaultCountry] = useState(team.defaultCountry || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    const speed = Number(speedLimitSeconds);
    if (!Number.isFinite(speed) || speed < 0) return setError("Enter a valid speed limit in seconds.");
    const cap = dailyCap.trim() === "" ? null : Number(dailyCap);
    if (cap !== null && (!Number.isFinite(cap) || cap < 1)) return setError("Enter a valid daily cap, or leave it blank for off.");

    setSaving(true);
    try {
      const res = await fetch("/api/outreach/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speedLimitSeconds: speed, dailyCap: cap, defaultCountry: defaultCountry || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save these settings.");
      onTeamChange((prev) => ({ ...prev, speedLimitSeconds: speed, dailyCap: cap, defaultCountry: defaultCountry || null }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save these settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
      <h2 className="text-sm font-semibold text-white">Settings</h2>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="speed-limit">Speed limit (seconds between claims)</label>
        <input
          id="speed-limit"
          type="number"
          min={0}
          value={speedLimitSeconds}
          onChange={(e) => setSpeedLimitSeconds(e.target.value)}
          className="w-full max-w-xs rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#25D366]"
        />
        <p className="mt-1 text-xs text-slate-500">How long a salesperson must wait between two customers. Stops one person grabbing them all at once.</p>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="daily-cap">Daily cap per salesperson (optional)</label>
        <input
          id="daily-cap"
          type="number"
          min={1}
          placeholder="No limit"
          value={dailyCap}
          onChange={(e) => setDailyCap(e.target.value)}
          className="w-full max-w-xs rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
        <p className="mt-1 text-xs text-slate-500">Leave blank for no daily limit.</p>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="default-country">Default country</label>
        <select
          id="default-country"
          value={defaultCountry}
          onChange={(e) => setDefaultCountry(e.target.value)}
          className="w-full max-w-xs rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#25D366]"
        >
          <option value="">None</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.dial} {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">Used to complete phone numbers with no country code on imports.</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {success && <span className="text-sm font-semibold text-[#25D366]">Saved.</span>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
    </form>
  );
}
