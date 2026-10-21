"use client";
import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";

export default function GoogleSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { getProviders().then(p => setAvailable(!!p?.google)).catch(() => {}).finally(() => setLoaded(true)); }, []);
  // Reserve the button's space until we know, so the form below does not jump (CLS).
  if (!loaded) return <div aria-hidden className="mb-5 h-[7.25rem]" />;
  if (!available) return null;
  return <div className="mb-5">
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await signIn("google", { callbackUrl }); } catch { setError("Google sign-in could not start. Please try again or use an email code."); setBusy(false); }
    }} className="btn-press flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-border-strong bg-surface text-[15px] font-semibold text-text transition-colors hover:bg-surface-2 disabled:opacity-50">{busy ? "Opening Google…" : "Continue with Google"}</button>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    <p className="my-6 flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">Or continue with email</p>
  </div>;
}
