"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import EmailCodeConfirm from "@/app/components/EmailCodeConfirm";

export default function SecurityPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [emailCode, setEmailCode] = useState(""); const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/account/security", { cache: "no-store" }).then(async r => { if (r.status === 401) { location.href = "/login?redirect=/account/security"; return; } if (!r.ok) throw new Error("Could not load account security."); setEnabled((await r.json()).enabled); }).catch(e => setError(e.message)); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/account/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: setup ? "confirm" : "begin", emailCode, code }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || "Setup failed.");
      if (data.enabled) { setRecovery(data.recoveryCodes); setEnabled(true); setSetup(null); setEmailCode(""); setCode(""); }
      else setSetup({ secret: data.secret, qr: await QRCode.toDataURL(data.uri) });
    } catch (e) { setError(e instanceof Error ? e.message : "Setup failed."); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl px-4 py-12 text-text"><Link className="text-accent" href="/account">← Account</Link><h1 className="text-3xl font-bold my-6">Account security</h1>
    <p className="text-muted mb-6">Protect your account with an authenticator app. Once enabled, sign in with your email code plus your authenticator code. Google sign-in is unavailable for accounts protected this way.</p>
    {error && <p role="alert" className="text-danger mb-4">{error}</p>}
    {recovery.length ? <section><h2 className="text-xl font-semibold">Save your recovery codes now</h2><p className="my-4">Each code works once. Store them privately; they are only displayed here once. Your previous sessions have been signed out.</p><pre className="bg-surface p-4 overflow-auto">{recovery.join("\n")}</pre><Link className="inline-block mt-6 text-accent" href="/login">Sign in with two-factor authentication</Link></section> : enabled ? <p>Two-factor authentication is enabled.</p> : enabled === false ? <form onSubmit={submit} className="space-y-4">
    {!setup && <EmailCodeConfirm value={emailCode} onChange={setEmailCode} />}
    {setup && <><p>Scan this QR code in your authenticator app, then enter its six-digit code.</p><img src={setup.qr} width={220} height={220} alt="Authenticator setup QR code" /><p className="break-all text-sm">Manual setup key: <code>{setup.secret}</code></p><label className="block">Authenticator code<input className="block w-full rounded-xl bg-surface border border-border-strong p-3 mt-2" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={e => setCode(e.target.value)} /></label></>}
    <button className="rounded-full bg-accent text-on-accent px-6 py-3 font-semibold disabled:opacity-50" disabled={busy}>{busy ? "Checking…" : setup ? "Enable two-factor authentication" : "Set up authenticator"}</button></form> : <p>Loading security settings…</p>}
  </main>;
}
