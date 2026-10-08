"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeInternalRedirect } from "@/lib/safe-redirect";
import AuthShell from "@/app/components/AuthShell";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";

function LoginForm() {
  const params = useSearchParams();
  const redirect = safeInternalRedirect(params.get("redirect"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await signIn("credentials", { email: email.trim(), password, otp, redirect: false });
      if (!res?.ok || res.error) { setError("We couldn't sign you in. Check your email, password and authenticator code. If you've tried several times, wait 15 minutes before retrying."); return; }
      window.location.href = redirect;
    } catch {
      setError("We couldn't reach Wazap. Your details are still here—please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="login" nextHref={`/signup?redirect=${encodeURIComponent(redirect)}`}>
      {params.get("error") && <p role="alert" className="mb-4 text-sm text-red-400">Google sign-in did not complete. Use a verified Gmail or Google Workspace account, try again, or sign in with your password.</p>}
      <GoogleSignInButton callbackUrl={redirect} />
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-xs text-slate-400 mb-1.5">Email</label>
          <input id="login-email" name="email" autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] transition-colors" placeholder="you@example.com" />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><label htmlFor="login-password" className="block text-xs text-slate-400">Password</label><Link href="/forgot-password" className="text-xs text-[#25D366] hover:underline">Forgot password?</Link></div>
          <input id="login-password" name="password" autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required maxLength={128}
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] transition-colors" placeholder="••••••••" />
          <button type="button" aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="mt-2 text-xs text-slate-400 hover:text-white">{showPassword ? "Hide password" : "Show password"}</button>
        </div>
        <div><label htmlFor="login-otp" className="block text-xs text-slate-400 mb-1.5">Authenticator or recovery code (if enabled)</label><input id="login-otp" autoComplete="one-time-code" maxLength={64} value={otp} onChange={e => setOtp(e.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white" /></div>
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 py-3 text-sm font-semibold text-black transition-colors">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-4">
        No account? <Link href={`/signup?redirect=${encodeURIComponent(redirect)}`} className="text-[#25D366] hover:underline">Sign up free</Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {return <Suspense fallback={<main className="wp-auth-page"><p role="status">Preparing your workspace…</p></main>}><LoginForm/></Suspense>;}
