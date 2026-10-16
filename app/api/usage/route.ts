import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Daily usage is recorded for plain analytics only (dashboard/ops visibility).
// It is never used to gate or block a tool any more — see FEAT-PLAN-LIMITS:
// the old 30-day QR trial and opens/qr daily caps were removed.
function today() { return new Date().toISOString().slice(0, 10); }

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const usage = await prisma.dailyUsage.findUnique({ where: { userId_date: { userId, date: today() } } });
  return NextResponse.json({ opens: usage?.opens ?? 0, qrDownloads: usage?.qrDownloads ?? 0 });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { type } = await req.json().catch(() => ({ type: null }));
  if (type !== "open" && type !== "qr") return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const field = type === "open" ? "opens" : "qrDownloads";
  const updated = await prisma.dailyUsage.upsert({
    where: { userId_date: { userId, date: today() } },
    create: { userId, date: today(), [field]: 1 },
    update: { [field]: { increment: 1 } },
  });
  return NextResponse.json({ [field]: (updated as any)[field] });
}
