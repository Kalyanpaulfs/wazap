"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/password/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setError(data.error || "Please wait and try again.");
    setNotice(data.notice);
    setEmail("");
  }

  return <main className="hero-bg min-h-[calc(100vh-56px)] px-4 py-20"><div className="mx-auto max-w-sm">
    <div className="mb-8 text-center"><h1 className="text-2xl font-bold text-white">Reset your password</h1><p className="mt-2 text-sm text-slate-400">We’ll queue a secure, single-use link if the account exists.</p></div>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-800 bg-[#111811] p-6">
      <div><label className="mb-1.5 block text-xs text-slate-400">Account email</label><input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white focus:border-[#25D366] focus:outline-none" placeholder="you@example.com"/></div>
      {notice&&<p className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-3 text-xs leading-5 text-[#25D366]">{notice}</p>}
      {error&&<p className="text-xs text-red-400">{error}</p>}
      <button disabled={loading} className="w-full rounded-full bg-[#25D366] py-3 text-sm font-semibold text-black disabled:opacity-50">{loading?"Queuing secure link…":"Send reset link"}</button>
    </form>
    <p className="mt-4 text-center text-sm text-slate-500"><Link href="/login" className="text-[#25D366] hover:underline">Return to sign in</Link></p>
  </div></main>;
}
