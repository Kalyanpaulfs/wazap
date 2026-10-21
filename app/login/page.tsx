"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeInternalRedirect } from "@/lib/safe-redirect";
import AuthShell from "@/app/components/AuthShell";
import GoogleSignInButton from "@/app/components/GoogleSignInButton";
import EmailCodeSignIn from "@/app/components/EmailCodeSignIn";

function LoginForm() {
  const params = useSearchParams();
  const redirect = safeInternalRedirect(params.get("redirect"));
  return (
    <AuthShell mode="login" nextHref={`/signup?redirect=${encodeURIComponent(redirect)}`}>
      {params.get("error") && <p role="alert" className="mb-4 text-sm text-danger">Google sign-in did not complete. Use a verified Gmail or Google Workspace account, try again, or sign in with an email code.</p>}
      <GoogleSignInButton callbackUrl={redirect} />
      <EmailCodeSignIn mode="login" redirect={redirect} />
      <p className="text-center text-sm text-muted mt-4">
        No account? <Link href={`/signup?redirect=${encodeURIComponent(redirect)}`} className="font-medium text-accent hover:underline">Sign up free</Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {return <Suspense fallback={<main className="wp-auth-page"><p role="status">Preparing your workspace…</p></main>}><LoginForm/></Suspense>;}
