"use client";

import { useState } from "react";

export default function AcceptInvitationButton({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true); setError("");
    const response = await fetch("/api/workspaces/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Could not accept this invitation."); setBusy(false); return; }
    window.location.href = "/tools/follow-up";
  }
  return <div className="mt-7"><button disabled={busy} onClick={accept} className="rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black disabled:opacity-60">{busy ? "Joining…" : "Accept and open Wazap Flow"}</button>{error && <p className="mt-3 text-sm text-red-300">{error}</p>}</div>;
}
