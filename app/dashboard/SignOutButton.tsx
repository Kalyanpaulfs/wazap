"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/" })} className="flex min-h-9 items-center gap-1.5 text-muted transition-colors hover:text-text">
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}
