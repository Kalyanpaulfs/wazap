import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const STATUSES = new Set(["inquiry", "quoted", "won", "lost"]);

async function userId() {
  const session = await getServerSession(authOptions);
  return session?.user ? (session.user as { id: string }).id : null;
}

export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orders = await prisma.catalogOrder.findMany({
    where: { userId: id },
    include: { catalogPage: { select: { title: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(orders);
}

export async function PATCH(req: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const status = String(body.status ?? "").toLowerCase();
  if (!body.id || !STATUSES.has(status)) return NextResponse.json({ error: "Invalid order update." }, { status: 400 });
  const order = await prisma.catalogOrder.findFirst({ where: { id: String(body.id), userId: id } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const leadStatus = status === "quoted" ? "proposal" : status === "won" || status === "lost" ? status : null;
  await prisma.$transaction(async (tx) => {
    await tx.catalogOrder.update({ where: { id: order.id }, data: { status } });
    if (order.leadId && leadStatus) {
      await tx.lead.updateMany({
        where: { id: order.leadId, userId: id },
        data: { status: leadStatus, closedAt: ["won", "lost"].includes(leadStatus) ? new Date() : null },
      });
      await tx.leadActivity.create({
        data: { leadId: order.leadId, type: "catalog_outcome", body: `Catalog inquiry changed to ${status}` },
      });
    }
  });
  return NextResponse.json({ success: true });
}
