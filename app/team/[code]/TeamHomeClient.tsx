"use client";
// FEAT-QUEUE phase 3: the signed-in salesperson's home screen - "Hi <name>",
// a big "Next customer" button (hits the tap-to-claim route), today's
// count, "give back" for a mis-tap, and friendly copy for every blocked
// state the claim route can redirect back here with.
import { useEffect, useState } from "react";

type LastContact = { name: string | null; maskedPhone: string } | null;

export default function TeamHomeClient({
  code,
  memberName,
  todayCount,
  lastContact,
  blocked,
  retryAfterMs,
}: {
  code: string;
  memberName: string;
  todayCount: number;
  lastContact: LastContact;
  blocked: string | null;
  retryAfterMs: number | null;
}) {
  const [secondsLeft, setSecondsLeft] = useState(blocked === "speed_limit" && retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 0);
  const [giveBackState, setGiveBackState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [giveBackError, setGiveBackError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function giveBack() {
    setGiveBackState("sending");
    setGiveBackError("");
    try {
      const res = await fetch("/api/outreach/give-back", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not give this customer back.");
      setGiveBackState("done");
    } catch (e) {
      setGiveBackState("error");
      setGiveBackError(e instanceof Error ? e.message : "Could not give this customer back.");
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/outreach/logout", { method: "POST" });
    } finally {
      window.location.href = `/team/${code}/home`;
    }
  }

  const waiting = secondsLeft > 0;
  const dailyCapReached = blocked === "daily_cap";
  const noContacts = blocked === "no_contacts";
  const nextDisabled = waiting || dailyCapReached || noContacts;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Hi {memberName}</h1>

      {waiting && (
        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          Please wait {secondsLeft}s before the next customer.
        </p>
      )}
      {dailyCapReached && !waiting && (
        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          You&apos;ve reached today&apos;s limit. Try again tomorrow.
        </p>
      )}
      {noContacts && !waiting && (
        <p className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          All customers are done 🎉 New ones coming soon.
        </p>
      )}

      <div className="mt-6">
        {nextDisabled ? (
          <span className="block w-full cursor-not-allowed rounded-full bg-slate-700 px-5 py-4 text-center text-lg font-bold text-slate-400">
            Next customer
          </span>
        ) : (
          <a
            href={`/team/${code}`}
            className="block w-full rounded-full bg-[#25D366] px-5 py-4 text-center text-lg font-bold text-black hover:bg-[#1fba58]"
          >
            Next customer
          </a>
        )}
      </div>

      <p className="mt-4 text-sm text-slate-400">
        Today: {todayCount} customer{todayCount === 1 ? "" : "s"}
      </p>

      {lastContact && giveBackState !== "done" && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
          <span className="text-slate-300">Last: {lastContact.name || lastContact.maskedPhone}</span>
          <button
            type="button"
            onClick={giveBack}
            disabled={giveBackState === "sending"}
            className="font-semibold text-[#25D366] hover:underline disabled:opacity-60"
          >
            {giveBackState === "sending" ? "Giving back…" : "Give back"}
          </button>
        </div>
      )}
      {giveBackState === "done" && <p className="mt-4 text-sm text-slate-400">Given back.</p>}
      {giveBackState === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {giveBackError}
        </p>
      )}

      <p className="mt-8 text-xs text-slate-600">
        Tip: add this page to your home screen (your browser&apos;s menu → Add to Home Screen) so it&apos;s one tap away next time.
      </p>

      <button type="button" onClick={logout} disabled={loggingOut} className="mt-6 text-sm text-slate-500 hover:text-slate-300">
        {loggingOut ? "Logging out…" : "Log out this device"}
      </button>
    </div>
  );
}
