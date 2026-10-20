import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TicketsClient from "./TicketsClient";

export const metadata: Metadata = {
  title: "My tickets — Wazap",
  robots: { index: false, follow: false },
};

export default async function SupportTicketsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?redirect=/support/tickets");
  return <TicketsClient />;
}
