import { prisma } from "./prisma";

export type BillingAttentionInput = {
  provider: "dodo" | "paypal";
  eventId: string;
  eventType: string;
  reason: string;
  chargeId?: string | null;
  userId?: string | null;
  email?: string | null;
  amount?: number | null;
  currency?: string | null;
};

// Records a verified payment event that needs a human. Idempotent per event so
// provider retries never create duplicates.
export async function recordBillingAttention(input: BillingAttentionInput) {
  console.error("[billing] needs attention", input.provider, input.eventType, input.reason);
  const data = {
    eventType: input.eventType.slice(0, 100),
    reason: input.reason.slice(0, 300),
    chargeId: input.chargeId?.slice(0, 200) || null,
    userId: input.userId || null,
    email: input.email?.slice(0, 320) || null,
    amount: Number.isFinite(input.amount) ? input.amount : null,
    currency: input.currency?.slice(0, 3) || null,
  };
  await prisma.billingAttention.upsert({
    where: { provider_eventId: { provider: input.provider, eventId: input.eventId.slice(0, 200) } },
    create: { provider: input.provider, eventId: input.eventId.slice(0, 200), ...data },
    update: data,
  });
}
