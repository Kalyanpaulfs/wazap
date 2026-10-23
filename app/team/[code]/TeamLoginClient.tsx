"use client";
// FEAT-QUEUE phase 3: salesperson first-device login - phone number, then a
// 6-digit code sent to their stored email (lib/outreach/login.ts). No
// account/password - the phone number is only used to look the member up;
// the code never reveals whether the number is actually on the team (see
// NEUTRAL_MESSAGE in lib/outreach/login.ts).
import { useState } from "react";
import PhoneInput, { type PhoneInputValue } from "@/app/components/PhoneInput";

export default function TeamLoginClient({ code, defaultCountry }: { code: string; defaultCountry: string | null }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState<PhoneInputValue>({ e164Digits: "", valid: false });
  const [sentNotice, setSentNotice] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!phone.valid) {
      setError("Enter a valid phone number.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/outreach/member-login/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone: "+" + phone.e164Digits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send a code. Please try again.");
      setSentNotice(data.maskedEmail ? `A code was sent to ${data.maskedEmail}.` : data.message || "If you're on the team, a code was sent to your email.");
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send a code. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.trim().length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/outreach/member-login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone: "+" + phone.e164Digits, otp: otp.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Incorrect or expired code.");
      // Full reload (not router.refresh()) so the Server Component is sure
      // to read the just-set device cookie on its next render.
      window.location.href = `/team/${code}/home`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect or expired code.");
    } finally {
      setVerifying(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} className="space-y-4">
        <PhoneInput ariaLabel="Your phone number" defaultCountry={defaultCountry} onChange={setPhone} required placeholder="Your phone number" />
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-full bg-[#25D366] px-5 py-3 text-base font-bold text-black hover:bg-[#1fba58] disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="space-y-4">
      <p className="text-sm text-slate-300">{sentNotice}</p>
      <input
        aria-label="6-digit code"
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus
        placeholder="6-digit code"
        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-2xl tracking-[0.5em] text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
      />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={verifying}
        className="w-full rounded-full bg-[#25D366] px-5 py-3 text-base font-bold text-black hover:bg-[#1fba58] disabled:opacity-60"
      >
        {verifying ? "Checking…" : "Verify"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("phone");
          setOtp("");
          setError("");
        }}
        className="w-full text-sm text-slate-400 hover:text-slate-200"
      >
        Request a new code
      </button>
    </form>
  );
}
