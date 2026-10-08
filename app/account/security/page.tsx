"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";

export default function SecurityPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/account/security", { cache: "no-store" }).then(async r => { if (r.status === 401) { location.href = "/login?redirect=/account/security"; return; } if (!r.ok) throw new Error("Could not load account security."); setEnabled((await r.json()).enabled); }).catch(e => setError(e.message)); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/account/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: setup ? "confirm" : "begin", password, code }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || "Setup failed.");
      if (data.enabled) { setRecovery(data.recoveryCodes); setEnabled(true); setSetup(null); setPassword(""); setCode(""); }
      else setSetup({ secret: data.secret, qr: await QRCode.toDataURL(data.uri) });
    } catch (e) { setError(e instanceof Error ? e.message : "Setup failed."); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl px-4 py-12 text-white"><Link className="text-[#25D366]" href="/account">← Account</Link><h1 className="text-3xl font-bold my-6">Account security</h1>
    <p className="text-slate-300 mb-6">Protect your account with an authenticator app. Once enabled, sign in with your password and authenticator code. Google sign-in is unavailable for accounts protected this way.</p>
    {error && <p role="alert" className="text-red-400 mb-4">{error}</p>}
    {recovery.length ? <section><h2 className="text-xl font-semibold">Save your recovery codes now</h2><p className="my-4">Each code works once. Store them privately; they are only displayed here once. Your previous sessions have been signed out.</p><pre className="bg-slate-900 p-4 overflow-auto">{recovery.join("\n")}</pre><Link className="inline-block mt-6 text-[#25D366]" href="/login">Sign in with two-factor authentication</Link></section> : enabled ? <p>Two-factor authentication is enabled.</p> : enabled === false ? <form onSubmit={submit} className="space-y-4">
    <label className="block">Current password<input className="block w-full rounded-xl bg-slate-900 border border-slate-700 p-3 mt-2" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
    {setup && <><p>Scan this QR code in your authenticator app, then enter its six-digit code.</p><img src={setup.qr} width={220} height={220} alt="Authenticator setup QR code" /><p className="break-all text-sm">Manual setup key: <code>{setup.secret}</code></p><label className="block">Authenticator code<input className="block w-full rounded-xl bg-slate-900 border border-slate-700 p-3 mt-2" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={e => setCode(e.target.value)} /></label></>}
    <button className="rounded-full bg-[#25D366] text-black px-6 py-3 font-semibold disabled:opacity-50" disabled={busy}>{busy ? "Checking…" : setup ? "Enable two-factor authentication" : "Set up authenticator"}</button></form> : <p>Loading security settings…</p>}
  </main>;
}
