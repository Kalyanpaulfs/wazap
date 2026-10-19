import type { Metadata } from "next";
import { notFound } from "next/navigation";
import KitDemo from "./KitDemo";

export const metadata: Metadata = { title: "UI kit", robots: { index: false, follow: false } };

// Internal style guide: development only, never served in production.
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitDemo />;
}
