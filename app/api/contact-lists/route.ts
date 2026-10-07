import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Contact = { number: string; name: string };

function cleanContacts(input: unknown): Contact[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((c: any) => ({ number: String(c?.number ?? "").replace(/\D/g, ""), name: String(c?.name ?? "").slice(0, 80) }))
    .filter((c) => c.number.length >= 7 && c.number.length <= 15)
    .slice(0, 5000);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const l = await prisma.contactList.findFirst({ where: { id, userId } });
    if (!l) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ list: { id: l.id, name: l.name, count: l.count, contacts: l.contacts } });
  }

  const lists = await prisma.contactList.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, count: true, updatedAt: true },
  });
  return NextResponse.json({ lists: lists.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() })) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const { name, contacts } = (await req.json().catch(() => ({}))) as { name?: string; contacts?: unknown };
  const clean = cleanContacts(contacts);
  if (!name?.trim() || clean.length === 0) {
    return NextResponse.json({ error: "A name and at least one valid number are required." }, { status: 400 });
  }

  const total = await prisma.contactList.count({ where: { userId } });
  if (total >= 50) return NextResponse.json({ error: "You can save up to 50 audiences." }, { status: 400 });

  const list = await prisma.contactList.create({
    data: { userId, name: name.trim().slice(0, 60), contacts: clean, count: clean.length },
  });
  return NextResponse.json({ id: list.id, name: list.name, count: list.count });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.contactList.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
