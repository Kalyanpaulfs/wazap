import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supportWhatsapp } from "@/lib/support-whatsapp";
import SupportClient from "./SupportClient";

export const metadata: Metadata = {
  title: "Customer Support — Accounts and Billing",
  description: "Get help with Wazap account access, billing, lead-routing workflows, and product issues.",
  alternates: { canonical: "https://wazap.lt/support" },
};

// Login state, the WhatsApp card and the open-ticket count are worked out
// here on the server, so nothing pops in after the page loads.
export default async function SupportPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id || null;
  const [whatsapp, openTicketCount] = await Promise.all([
    supportWhatsapp(userId),
    userId ? prisma.supportTicket.count({ where: { userId, status: { in: ["open", "investigating", "waiting"] } } }) : Promise.resolve(null),
  ]);
  return <SupportClient loggedIn={Boolean(userId)} whatsapp={whatsapp} openTicketCount={openTicketCount} />;
}
