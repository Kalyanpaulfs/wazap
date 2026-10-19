"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeInternalRedirect } from "@/lib/safe-redirect";
import AuthShell from "@/app/components/AuthShell";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";
import EmailCodeSignIn from "@/app/components/EmailCodeSignIn";

function SignupForm() {
  const params = useSearchParams();
  const redirect = safeInternalRedirect(params.get("redirect"));
  return (
    <AuthShell mode="signup" nextHref={`/login?redirect=${encodeURIComponent(redirect)}`}>
      <GoogleSignInButton callbackUrl={redirect} />
      <EmailCodeSignIn mode="signup" redirect={redirect} />
      <p className="text-center text-sm text-muted mt-4">
        Already have an account? <Link href={`/login?redirect=${encodeURIComponent(redirect)}`} className="font-medium text-accent hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}

export default function SignupPage() {return <Suspense fallback={<main className="wp-auth-page"><p role="status">Preparing your workspace…</p></main>}><SignupForm/></Suspense>;}
