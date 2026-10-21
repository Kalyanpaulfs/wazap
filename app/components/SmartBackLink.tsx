"use client";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// "← Back" for pages people open from anywhere (policies, About): returns
// to the previous page when it was on this site, otherwise to `fallback`.
export default function SmartBackLink({ fallback = "/support" }: { fallback?: string }) {
  const router = useRouter();
  function goBack() {
    let sameSite = false;
    try { sameSite = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin; } catch {}
    if (sameSite && window.history.length > 1) router.back();
    else router.push(fallback);
  }
  return (
    <button type="button" onClick={goBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  );
}
