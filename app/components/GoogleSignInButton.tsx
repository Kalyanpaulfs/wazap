"use client";
import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";

export default function GoogleSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { getProviders().then(p => setAvailable(!!p?.google)).catch(() => {}); }, []);
  if (!available) return null;
  return <div className="mb-5">
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await signIn("google", { callbackUrl }); } catch { setError("Google sign-in could not start. Please try again or use an email code."); setBusy(false); }
    }} className="wp-auth-google disabled:opacity-50">{busy ? "Opening Google…" : "Continue with Google"}</button>
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    <p className="wp-auth-divider">Or continue with email</p>
  </div>;
}
