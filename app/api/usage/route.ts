import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, PLAN_LIMITS } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function today() { return new Date().toISOString().slice(0, 10); }

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const plan = (session.user as any).plan ?? "free";
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;

  const usage = await prisma.dailyUsage.findUnique({ where: { userId_date: { userId, date: today() } } });
  return NextResponse.json({
    opens: usage?.opens ?? 0,
    qrDownloads: usage?.qrDownloads ?? 0,
    limits: { opens: limits.opens === Infinity ? null : limits.opens, qr: limits.qr === Infinity ? null : limits.qr },
    plan,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const plan = (session.user as any).plan ?? "free";
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
  const { type } = await req.json();

  const usage = await prisma.dailyUsage.upsert({
    where: { userId_date: { userId, date: today() } },
    create: { userId, date: today() },
    update: {},
  });

  if (type === "open") {
    if (limits.opens !== Infinity && usage.opens >= limits.opens) {
      return NextResponse.json({ error: "limit", remaining: 0 }, { status: 429 });
    }
    const updated = await prisma.dailyUsage.update({
      where: { userId_date: { userId, date: today() } },
      data: { opens: { increment: 1 } },
    });
    return NextResponse.json({ remaining: limits.opens === Infinity ? null : limits.opens - updated.opens });
  }

  if (type === "qr") {
    if (limits.qr !== Infinity && usage.qrDownloads >= limits.qr) {
      return NextResponse.json({ error: "limit", remaining: 0 }, { status: 429 });
    }
    const updated = await prisma.dailyUsage.update({
      where: { userId_date: { userId, date: today() } },
      data: { qrDownloads: { increment: 1 } },
    });
    return NextResponse.json({ remaining: limits.qr === Infinity ? null : limits.qr - updated.qrDownloads });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
