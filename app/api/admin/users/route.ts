import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  return NextResponse.json(users.map(u => ({
    id: u.id, email: u.email, name: u.name, plan: u.plan,
    planExpiresAt: u.planExpiresAt?.toISOString() ?? null,
    trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
    trialPlan: u.trialPlan,
    isAdmin: u.isAdmin, createdAt: u.createdAt.toISOString(),
    payments: u.payments.map(p => ({ ...p, createdAt: p.createdAt.toISOString(), activatedAt: p.activatedAt?.toISOString() ?? null })),
  })));
}
