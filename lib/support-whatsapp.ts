import "server-only";
import { prisma } from "./prisma";
import { linkPlan } from "./router-entitlements";
import { whatsappSupportEligible } from "./support-ticket-rules";

export type SupportWhatsapp = { available: true; url: string } | { available: false; reason: "plan" | "unavailable" };

// WhatsApp support button: only for a logged-in customer on a plan that
// resolves to "pro" or "ultimate" (Growth / Agency), and only when the
// support number is configured. Digits-only number from env. Shared by
// /api/support/whatsapp and the server-rendered Help page.
export async function supportWhatsapp(userId: string | null | undefined): Promise<SupportWhatsapp> {
  const number = (process.env.SUPPORT_WHATSAPP_NUMBER || "").replace(/[^0-9]/g, "");
  if (!number) return { available: false, reason: "unavailable" };
  if (!userId) return { available: false, reason: "plan" };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, plan: true, planExpiresAt: true, trialStartedAt: true, trialEndsAt: true, trialPlan: true },
  });
  if (!user || !whatsappSupportEligible(linkPlan(user))) return { available: false, reason: "plan" };
  const text = encodeURIComponent(`Hi Wazap support, my account email is ${user.email}`);
  return { available: true, url: `https://wa.me/${number}?text=${text}` };
}
