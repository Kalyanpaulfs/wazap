"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/" })} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors">
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}
