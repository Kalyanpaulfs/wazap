"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

const input = "w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] transition-colors";
const button = "w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 py-3 text-sm font-semibold text-black transition-colors";
const RESEND_SECONDS = 60;

export default function EmailCodeSignIn({ mode, redirect }: { mode: "login" | "signup"; redirect: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), purpose: "login" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error || "We could not send the code. Please try again."); return; }
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
      setNotice(`We sent a 6-digit code to ${email.trim()}. It expires in 10 minutes.`);
    } catch {
      setError("We couldn't reach Wazap. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const attribution = (() => { try { return sessionStorage.getItem("wazap:attribution") || ""; } catch { return ""; } })();
      const res = await signIn("email-code", { email: email.trim(), code: code.trim(), otp: otp.trim(), name: name.trim(), attribution, marketing: mode === "signup" ? String(marketing) : "false", redirect: false });
      if (res?.error === "MFA_REQUIRED") { setNeedsOtp(true); setNotice("This account uses two-factor authentication. Enter your authenticator or recovery code."); return; }
      if (res?.error === "MFA_INVALID") { setNeedsOtp(true); setError("That authenticator code is not valid. Try the next code from your app."); return; }
      if (res?.error?.startsWith("CODE_WRONG:")) {
        const left = Number(res.error.split(":")[1]);
        setError(`That code is not correct. You have ${left} ${left === 1 ? "attempt" : "attempts"} left.`);
        return;
      }
      if (res?.error === "IP_BLOCKED") { setError("Too many wrong codes from your network. Please try again in 12 hours, or continue with Google."); return; }
      if (res?.error === "CODE_LOCKED") { setCode(""); setError("Too many wrong attempts. This code is locked. Tap \"Resend code\" to get a new one."); return; }
      if (res?.error === "CODE_EXPIRED") { setCode(""); setError("This code has expired or was replaced by a newer one. Tap \"Resend code\" to get a new one."); return; }
      if (!res?.ok || res.error) { setError("We couldn't sign you in right now. Please wait a few minutes and try again."); return; }
      if (mode === "signup") window.gtag?.("event", "sign_up", { method: "email_code" });
      window.location.href = redirect;
    } catch {
      setError("We couldn't reach Wazap. Your code is still valid. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "email") return (
    <form onSubmit={sendCode} className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
      {mode === "signup" && <div>
        <label htmlFor="auth-name" className="block text-xs text-slate-400 mb-1.5">Name (optional)</label>
        <input id="auth-name" name="name" autoComplete="name" type="text" maxLength={100} value={name} onChange={e => setName(e.target.value)} className={input} placeholder="Your name" />
      </div>}
      <div>
        <label htmlFor="auth-email" className="block text-xs text-slate-400 mb-1.5">Email</label>
        <input id="auth-email" name="email" autoComplete="email" type="email" required maxLength={320} value={email} onChange={e => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
      </div>
      <p className="text-xs leading-5 text-slate-500">No password needed. We&apos;ll email you a 6-digit code.</p>
      {mode === "signup" && (
        <label className="flex items-start gap-2.5 text-xs leading-5 text-slate-400">
          <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 accent-[#25D366]" />
          <span>Send me early access to new features and member-only offers. You can stop anytime.</span>
        </label>
      )}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={loading || !email.trim()} className={button}>{loading ? "Sending code..." : "Email me a code"}</button>
    </form>
  );

  return (
    <form onSubmit={verify} className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
      {notice && <p role="status" className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-3 text-xs leading-5 text-[#25D366]">{notice}</p>}
      <div>
        <label htmlFor="auth-code" className="block text-xs text-slate-400 mb-1.5">6-digit code</label>
        <input id="auth-code" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus value={code} onChange={e => setCode(e.target.value.replace(/[^0-9 ]/g, ""))} className={`${input} text-center text-lg tracking-[0.5em]`} placeholder="000000" />
      </div>
      {needsOtp && <div>
        <label htmlFor="auth-otp" className="block text-xs text-slate-400 mb-1.5">Authenticator or recovery code</label>
        <input id="auth-otp" autoComplete="one-time-code" maxLength={64} required value={otp} onChange={e => setOtp(e.target.value)} className={input} />
      </div>}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={loading || code.replace(/\s/g, "").length !== 6} className={button}>
        {loading ? "Checking..." : mode === "signup" ? "Create my workspace" : "Sign in"}
      </button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={() => { setStep("email"); setNeedsOtp(false); setOtp(""); setError(""); setNotice(""); }} className="text-slate-400 hover:text-white">Change email</button>
        <button type="button" disabled={loading || cooldown > 0} onClick={() => sendCode()} className="text-[#25D366] hover:underline disabled:text-slate-500 disabled:no-underline">{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
      </div>
    </form>
  );
}
