import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { sameSiteRequest } from "@/lib/crm";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ip = requestIp(req.headers);
  if (!rateLimit(`qa-feedback:${ip}`, 30, 3_600_000)) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const answerId = cleanText(body.answerId, 60);
  if (!answerId || typeof body.solved !== "boolean") return NextResponse.json({ error: "Missing answer or outcome." }, { status: 400 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id || null;

  await prisma.supportAnswerFeedback.create({ data: { answerId, solved: body.solved, userId } });
  return NextResponse.json({ ok: true });
}
