import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";

function strongPassword(value: string) {
  return value.length >= 10 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

export async function POST(req: Request) {
  const ip = requestIp(req.headers);
  if (!rateLimit(`password-reset:${ip}`, 10, 60 * 60 * 1000)) return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  const password = String(body.password || "");
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  if (!strongPassword(password)) return NextResponse.json({ error: "Use at least 10 characters with uppercase, lowercase, and a number." }, { status: 400 });
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true, usedAt: true, expiresAt: true } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  const hashed = await bcrypt.hash(password, 12);
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (!claimed.count) throw new Error("TOKEN_ALREADY_USED");
      await tx.user.update({ where: { id: record.userId }, data: { password: hashed, sessionVersion: { increment: 1 } } });
      await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } });
    });
  } catch {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  return NextResponse.json({ success: true, notice: "Password updated. Existing sessions have been signed out." });
}
