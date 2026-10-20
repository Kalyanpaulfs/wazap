import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { whatsappSupportEligible } from "@/lib/support-ticket-rules";

// WhatsApp support button: only for a logged-in customer on a plan that
// resolves to "pro" or "ultimate" (Growth / Agency), and only when the
// support number is configured. Digits-only number from env.
export async function GET() {
  const number = (process.env.SUPPORT_WHATSAPP_NUMBER || "").replace(/[^0-9]/g, "");
  if (!number) return NextResponse.json({ available: false, reason: "unavailable" }, { headers: { "Cache-Control": "no-store" } });

  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;
  if (!sessionUser?.id) return NextResponse.json({ available: false, reason: "plan" }, { headers: { "Cache-Control": "no-store" } });

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { email: true, plan: true, planExpiresAt: true, trialStartedAt: true, trialEndsAt: true, trialPlan: true },
  });
  if (!user || !whatsappSupportEligible(linkPlan(user))) return NextResponse.json({ available: false, reason: "plan" }, { headers: { "Cache-Control": "no-store" } });

  const text = encodeURIComponent(`Hi Wazap support, my account email is ${user.email}`);
  return NextResponse.json({ available: true, url: `https://wa.me/${number}?text=${text}` }, { headers: { "Cache-Control": "no-store" } });
}
