"use client";
// FEAT-QUEUE: "Start" button on /outreach for an owner with no team yet -
// POSTs to create the one-per-owner team, then refreshes the server
// component so it renders the real OutreachClient.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartTeamButton() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/outreach/team", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start your team. Please try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start your team.");
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={start}
        disabled={starting}
        className="rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58] disabled:opacity-50"
      >
        {starting ? "Starting…" : "Start"}
      </button>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
