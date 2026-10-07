"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    const response = await fetch("/api/auth/password/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setError(data.error || "This reset link could not be used.");
    setNotice(data.notice);
    setPassword("");
    setConfirm("");
  }

  return <div className="mx-auto max-w-sm">
    <div className="mb-8 text-center"><h1 className="text-2xl font-bold text-white">Choose a new password</h1><p className="mt-2 text-sm text-slate-400">Completing the reset signs out existing Wazap sessions.</p></div>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-[#111811] p-6">
      <div><label className="mb-1.5 block text-xs text-slate-400">New password</label><input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white focus:border-[#25D366] focus:outline-none"/></div>
      <div><label className="mb-1.5 block text-xs text-slate-400">Confirm password</label><input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white focus:border-[#25D366] focus:outline-none"/></div>
      <p className="text-xs leading-5 text-slate-500">Use at least 10 characters with uppercase, lowercase, and a number.</p>
      {notice&&<p className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-3 text-xs leading-5 text-[#25D366]">{notice}</p>}
      {error&&<p className="text-xs text-red-400">{error}</p>}
      <button disabled={loading||!token||Boolean(notice)} className="w-full rounded-full bg-[#25D366] py-3 text-sm font-semibold text-black disabled:opacity-50">{loading?"Updating password…":"Update password"}</button>
    </form>
    <p className="mt-4 text-center text-sm text-slate-500"><Link href="/login" className="text-[#25D366] hover:underline">{notice?"Sign in with the new password":"Return to sign in"}</Link></p>
  </div>;
}

export default function ResetPasswordPage() {
  return <main className="hero-bg min-h-[calc(100vh-56px)] px-4 py-20"><Suspense fallback={<p className="text-center text-slate-400">Loading secure reset…</p>}><ResetForm/></Suspense></main>;
}
