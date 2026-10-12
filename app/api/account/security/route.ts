import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { verifyEmailCode } from "@/lib/email-code";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { base32, mfaState, pendingStep, sealMfa, recoveryHash } from "@/lib/mfa";
import { sharedRateLimit } from "@/lib/shared-rate-limit";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const state = await mfaState(userId);
  return NextResponse.json({ enabled: Boolean(state?.enabled) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await sharedRateLimit(`mfa-setup:${userId}`, 8, 15 * 60_000)) return NextResponse.json({ error: "Please wait 15 minutes before trying again." }, { status: 429 });
  const body = await req.json().catch(() => null);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!body || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  // The email code proves the request on "begin"; "confirm" relies on the pending secret it created.
  if (body.action === "begin" && !await verifyEmailCode(user.email, "confirm", String(body.emailCode || ""))) return NextResponse.json({ error: "Enter the latest code we emailed you." }, { status: 400 });
  const state = await mfaState(userId);
  if (state?.enabled) return NextResponse.json({ error: "Two-factor authentication is already enabled." }, { status: 409 });
  if (body.action === "begin") {
    const secret = base32(randomBytes(20)), encrypted = sealMfa(secret);
    await prisma.$executeRaw`INSERT INTO "SecurityMfa" ("userId", "pending", "pendingExpiresAt") VALUES (${userId}, ${encrypted}, now() + interval '10 minutes') ON CONFLICT ("userId") DO UPDATE SET "pending" = EXCLUDED."pending", "pendingExpiresAt" = EXCLUDED."pendingExpiresAt" WHERE "SecurityMfa"."enabled" = false`;
    return NextResponse.json({ secret, uri: `otpauth://totp/${encodeURIComponent("Wazap:" + user.email)}?secret=${secret}&issuer=Wazap&algorithm=SHA1&digits=6&period=30` }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.action !== "confirm" || !state) return NextResponse.json({ error: "Start authenticator setup first." }, { status: 400 });
  const step = pendingStep(state, String(body.code || ""));
  if (step === null) return NextResponse.json({ error: "The code is invalid or setup expired." }, { status: 400 });
  const codes = Array.from({ length: 8 }, () => randomBytes(16).toString("hex"));
  const hashes = codes.map(recoveryHash);
  const changed = await prisma.$transaction(async tx => {
    const count = await tx.$executeRaw`UPDATE "SecurityMfa" SET "enabled" = true, "secret" = "pending", "pending" = NULL, "pendingExpiresAt" = NULL, "lastStep" = ${BigInt(step)}, "recoveryHashes" = ${hashes}::text[], "enabledAt" = now() WHERE "userId" = ${userId} AND "enabled" = false AND "pending" = ${state.pending} AND "pendingExpiresAt" > now()`;
    if (count) await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    return count;
  });
  if (!changed) return NextResponse.json({ error: "Setup changed. Start again." }, { status: 409 });
  return NextResponse.json({ enabled: true, recoveryCodes: codes }, { headers: { "Cache-Control": "no-store" } });
}
