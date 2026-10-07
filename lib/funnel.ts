import { prisma } from "@/lib/prisma";
import { isProductTrialActive } from "@/lib/entitlements";

export const FUNNEL_EVENTS = [
  "pricing_view",
  "signup_completed",
  "trial_started",
  "trial_activated",
  "trial_converted",
  "trial_expired",
  "first_tool_success",
  "checkout_started",
  "checkout_approved",
  "subscription_activated",
  "subscription_renewed",
  "payment_failed",
  "subscription_cancelled",
  "marketplace_view",
  "marketplace_install",
  "agent_setup_started",
  "agent_test_completed",
  "agent_activated",
  "marketplace_review_submitted",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

export async function recordFunnelEvent(
  name: FunnelEventName,
  options: { userId?: string | null; source?: string | null; metadata?: Record<string, string | number | boolean | null> } = {},
) {
  try {
    if ([
      "signup_completed",
      "trial_started",
      "first_tool_success",
      "trial_activated",
      "trial_converted",
      "trial_expired",
      "subscription_activated",
    ].includes(name) && options.userId) {
      const existing = await prisma.funnelEvent.findFirst({
        where: { name, userId: options.userId },
        select: { id: true },
      });
      if (existing) return;
    }
    await prisma.funnelEvent.create({
      data: {
        name,
        userId: options.userId || null,
        source: options.source?.slice(0, 100) || null,
        metadata: options.metadata || undefined,
      },
    });
    if (name === "first_tool_success" && options.userId) {
      const user = await prisma.user.findUnique({ where: { id: options.userId }, select: { plan: true, trialPlan: true, trialEndsAt: true } });
      if (isProductTrialActive(user)) {
        const activated = await prisma.funnelEvent.findFirst({ where: { name: "trial_activated", userId: options.userId }, select: { id: true } });
        if (!activated) await prisma.funnelEvent.create({ data: { name: "trial_activated", userId: options.userId, source: options.source?.slice(0, 100) || null } });
      }
    }
  } catch (error) {
    console.error("[funnel] could not record event", name, error);
  }
}
