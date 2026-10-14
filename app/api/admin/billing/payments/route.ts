import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canRefund } from "@/lib/billing-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Choose a customer." }, { status: 400 });

  const payments = await prisma.payment.findMany({
    // Real charges only: subscription records (subscription_*) and unpaid checkouts (pending) are not payments.
    where: { userId, method: { in: ["paypal", "dodo"] }, status: { notIn: ["pending", "inactive", "subscription_active", "subscription_inactive", "provider_not_found"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, method: true, amount: true, currency: true, createdAt: true, status: true, txId: true },
  });
  const refunds = await prisma.billingRefund.findMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId } });
  const pointerLive = pointer
    ? Boolean(await prisma.payment.findFirst({ where: { userId, method: pointer.provider, txId: pointer.subscriptionId, status: "subscription_active" } }))
    : false;

  const now = new Date();
  const items = payments.map((p) => {
    const refund = refunds.find((r) => r.paymentId === p.id) || null;
    const alreadyRefunded = Boolean(refund && refund.status !== "failed");
    const check = canRefund({ paymentCreatedAt: p.createdAt, status: p.status, method: p.method, alreadyRefunded, now });
    return {
      id: p.id,
      provider: p.method,
      amount: p.amount,
      currency: p.currency,
      createdAt: p.createdAt,
      status: p.status,
      refundableUntil: new Date(p.createdAt.getTime() + 48 * 3_600_000),
      canRefund: check.ok,
      refundStatus: refund?.status ?? null,
    };
  });

  return NextResponse.json({
    payments: items,
    user: { autoRenew: pointer?.autoRenew ?? true, provider: pointer?.provider ?? null, pointerLive },
  });
}
