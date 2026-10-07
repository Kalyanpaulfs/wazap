import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { renderPasswordResetEmail } from "@/lib/email";
import { requestIp } from "@/lib/request-ip";

const GENERIC_NOTICE = "If an account exists for that email, a secure reset link has been queued.";

export async function POST(req: Request) {
  const ip = requestIp(req.headers);
  if (!rateLimit(`password-forgot-ip:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many reset requests. Please wait before trying again." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase().slice(0, 320);
  if (!email.includes("@")) return NextResponse.json({ notice: GENERIC_NOTICE }, { status: 202 });
  if (!rateLimit(`password-forgot-email:${createHash("sha256").update(email).digest("hex")}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ notice: GENERIC_NOTICE }, { status: 202 });
  }
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, password: true } });
    if (user?.password) {
      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const base = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt";
      const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
        prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
        prisma.outboundEmail.create({ data: { userId: user.id, recipient: user.email, type: "password_reset", subject: "Reset your Wazap password", html: renderPasswordResetEmail({ name: user.name, resetUrl }) } }),
      ]);
    }
  } catch {
    // Keep the public response enumeration-safe even when storage or email queuing is degraded.
  }
  return NextResponse.json({ notice: GENERIC_NOTICE }, { status: 202 });
}
