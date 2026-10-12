import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sameSiteRequest } from "@/lib/crm";

// Admin marks a payment event as reviewed.
export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id.slice(0, 40) : "";
  if (!id) return NextResponse.json({ error: "Choose an item." }, { status: 400 });
  const changed = await prisma.billingAttention.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt: new Date() } });
  return changed.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Already resolved or not found." }, { status: 404 });
}
