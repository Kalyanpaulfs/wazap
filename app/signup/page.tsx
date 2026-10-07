"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeInternalRedirect } from "@/lib/safe-redirect";
import AuthShell from "@/app/components/AuthShell";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";

function SignupForm() {
  const params = useSearchParams();
  const redirect = safeInternalRedirect(params.get("redirect"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword,setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
    const attribution = (() => {
      try { return JSON.parse(sessionStorage.getItem("wazap:attribution") || "null"); }
      catch { return null; }
    })();
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name:name.trim(), email:email.trim(), password, attribution }),
    });
    const data = await res.json();
    if (!res.ok) { setLoading(false); setError(data.error); return; }
    const login = await signIn("credentials", { email:email.trim(), password, redirect: false });
    if (login?.error) {
      setLoading(false);
      setError("Your account was created, but automatic sign-in failed. Please sign in to continue.");
      return;
    }
    window.gtag?.("event", "sign_up", { method: "credentials" });
    window.location.href = redirect;
    } catch {setError("We could not finish creating your workspace. Your details are still here; try again, or sign in if your account was already created.");}
    finally {setLoading(false);}
  }

  return (
    <AuthShell mode="signup" nextHref={`/login?redirect=${encodeURIComponent(redirect)}`}>
      <GoogleSignInButton callbackUrl={redirect} />
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
        <div>
          <label htmlFor="signup-name" className="block text-xs text-slate-400 mb-1.5">Name (optional)</label>
          <input id="signup-name" name="name" autoComplete="name" type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] transition-colors" placeholder="Your name" />
        </div>
        <div>
          <label htmlFor="signup-email" className="block text-xs text-slate-400 mb-1.5">Email</label>
          <input id="signup-email" name="email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] transition-colors" placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-xs text-slate-400 mb-1.5">Password</label>
          <input id="signup-password" name="password" type={showPassword?"text":"password"} value={password} onChange={e => setPassword(e.target.value)} required minLength={10} maxLength={128} autoComplete="new-password"
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] transition-colors" placeholder="10+ characters" />
          <div className="mt-2 flex justify-between gap-3 text-xs text-slate-400"><span>Uppercase, lowercase and a number.</span><button type="button" aria-controls="signup-password" aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>{showPassword?"Hide":"Show"} password</button></div>
        </div>
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 py-3 text-sm font-semibold text-black transition-colors">
          {loading ? "Starting your workspace..." : "Start 14-day Growth trial"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-4">
        Already have an account? <Link href={`/login?redirect=${encodeURIComponent(redirect)}`} className="text-[#25D366] hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}

export default function SignupPage() {return <Suspense fallback={<main className="wp-auth-page"><p role="status">Preparing your workspace…</p></main>}><SignupForm/></Suspense>;}
