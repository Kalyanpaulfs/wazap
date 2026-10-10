import type { Prisma } from "@prisma/client";
import { captureCrmLead } from "./crm";

/** Called inside the verified charge transaction; lifecycle events are not cash. */
export async function recordCrmPayment(tx: Prisma.TransactionClient, input: {
  provider: "paypal" | "dodo"; chargeId: string; paymentId: string;
  email: string; name: string | null; plan: string; amount: number;
  currency: string; occurredAt: Date;
}) {
  const lead = await captureCrmLead(tx, { email: input.email, name: input.name || input.email, source: "verified_payment" });
  await tx.crmActivity.upsert({
    where: { sourceKey: `verified-payment:${input.provider}:${input.chargeId}` },
    create: {
      leadId: lead.id, kind: "payment", createdAt: input.occurredAt,
      sourceKey: `verified-payment:${input.provider}:${input.chargeId}`,
      body: `Payment received: ${input.currency} ${input.amount.toFixed(2)} · ${input.plan} · ${input.provider}. Transaction: ${input.chargeId}. Payment record: ${input.paymentId}. This records a captured payment; current access and recurring status are shown in account billing.`,
    },
    update: {},
  });
}
