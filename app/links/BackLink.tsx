import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// UX-1 hardening: every /links/* sub-page (create forms, the created/success
// page, link details) gets the same "← label" back link at the very top, so
// people never have to fall back on the browser's back button. Same muted
// breadcrumb style as the rest of the app.
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}
