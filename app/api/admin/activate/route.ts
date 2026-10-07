import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planExpiry } from "@/lib/billing";

const ACTIVATABLE_PLANS = new Set(["basic", "pro", "ultimate", "business"]);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId, plan } = await req.json();
  if (!userId || !ACTIVATABLE_PLANS.has(plan)) return NextResponse.json({ error: "Invalid activation request" }, { status: 400 });

  const expiry = planExpiry(plan);
  await prisma.user.update({ where: { id: userId }, data: { plan, planExpiresAt: expiry } });
  return NextResponse.json({ success: true, planExpiresAt: expiry?.toISOString() ?? null });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json();
  await prisma.user.update({ where: { id: userId }, data: { plan: "free", planExpiresAt: null } });
  return NextResponse.json({ success: true });
}
