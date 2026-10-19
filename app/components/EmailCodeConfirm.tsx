"use client";

import { useEffect, useState } from "react";

// Step-up confirmation for sensitive account actions: emails a code to the
// signed-in user and lets them type it in place of the old password field.
export default function EmailCodeConfirm({ value, onChange, id = "confirm-email-code", className = "" }: { value: string; onChange: (code: string) => void; id?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "confirm" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(data.error || "We could not send the code."); return; }
      setCooldown(60);
      setMessage("Code sent to your account email. It expires in 10 minutes.");
    } catch {
      setMessage("We couldn't reach Wazap. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs text-muted mb-1.5">Email confirmation code</label>
      <div className="flex gap-2">
        <input id={id} autoComplete="one-time-code" inputMode="numeric" maxLength={7} required value={value} onChange={event => onChange(event.target.value.replace(/[^0-9 ]/g, ""))} className="w-full rounded-xl bg-surface border border-border-strong px-4 py-3 text-sm text-text tracking-[0.3em]" placeholder="000000" />
        <button type="button" onClick={send} disabled={busy || cooldown > 0} className="shrink-0 rounded-xl border border-accent/50 px-3 text-xs font-semibold text-accent disabled:opacity-50">{busy ? "Sending..." : cooldown > 0 ? `Resend ${cooldown}s` : "Email me a code"}</button>
      </div>
      {message && <p role="status" className="mt-2 text-xs text-muted">{message}</p>}
    </div>
  );
}
