import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const sends = await prisma.scheduledSend.findMany({
    where: { userId },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });
  return NextResponse.json({
    sends: sends.map((s) => ({
      id: s.id,
      status: s.status,
      scheduledFor: s.scheduledFor.toISOString(),
      count: Array.isArray(s.contacts) ? (s.contacts as unknown[]).length : 0,
      preview: s.message.slice(0, 60),
      error: s.error,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const { message, contacts, delaySec, scheduledFor } = (await req.json().catch(() => ({}))) as {
    message?: string; contacts?: any[]; delaySec?: number; scheduledFor?: string;
  };

  const clean = Array.isArray(contacts)
    ? contacts.map((c) => ({ number: String(c?.number ?? "").replace(/\D/g, ""), name: String(c?.name ?? "").slice(0, 80) }))
        .filter((c) => c.number.length >= 7 && c.number.length <= 15).slice(0, 5000)
    : [];
  const when = scheduledFor ? new Date(scheduledFor) : null;

  if (!message?.trim() || clean.length === 0) return NextResponse.json({ error: "A message and contacts are required." }, { status: 400 });
  if (!when || isNaN(when.getTime())) return NextResponse.json({ error: "Pick a valid date and time." }, { status: 400 });
  if (when.getTime() < Date.now() + 60_000) return NextResponse.json({ error: "Pick a time at least a minute from now." }, { status: 400 });

  const pending = await prisma.scheduledSend.count({ where: { userId, status: "pending" } });
  if (pending >= 20) return NextResponse.json({ error: "You already have 20 scheduled sends pending." }, { status: 400 });

  const send = await prisma.scheduledSend.create({
    data: {
      userId,
      message: message.trim(),
      contacts: clean,
      delaySec: Math.max(10, Number(delaySec) || 30),
      scheduledFor: when,
      status: "pending",
    },
  });
  return NextResponse.json({ id: send.id, scheduledFor: send.scheduledFor.toISOString(), count: clean.length });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.scheduledSend.updateMany({ where: { id, userId, status: "pending" }, data: { status: "cancelled" } });
  return NextResponse.json({ ok: true });
}
