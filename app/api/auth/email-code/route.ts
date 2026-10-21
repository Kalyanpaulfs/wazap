import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueEmailCode, normalizeEmail } from "@/lib/email-code";
import { requestIp } from "@/lib/request-ip";
import { sameSiteRequest } from "@/lib/crm";

// purpose "login": public, sends a sign-in code to any address (new addresses
// get an account after verifying). purpose "confirm": signed-in users only,
// always sent to the account's own email.
export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { email?: unknown; purpose?: unknown };
  const ip = requestIp(req.headers);

  if (body.purpose === "confirm") {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const result = await issueEmailCode(user.email, "confirm", ip);
    return result.ok ? NextResponse.json({ sent: true }) : NextResponse.json({ error: result.error }, { status: result.status });
  }

  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const result = await issueEmailCode(email, "login", ip);
  const devOtp = process.env.NODE_ENV === "development" && process.env.dev_otp === "true";
  return result.ok ? NextResponse.json({ sent: true, devOtp }) : NextResponse.json({ error: result.error }, { status: result.status });
}
