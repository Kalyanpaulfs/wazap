import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestIp } from "@/lib/request-ip";
import { rateLimit } from "@/lib/rate-limit";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { validateTargetUrl, isValidCustomCode, randomShortCode, buildShortUrlPublicUrl } from "@/lib/short-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Free, unlimited-ish tool (TOOL-FREE-2) - these are its OWN safety limits,
// deliberately separate from the shared link pool (lib/link-pool.ts), which
// rotators/WhatsApp links/ad links use. 20 per account per rolling 24h,
// counted straight from the table (no cache to go stale).
const ACCOUNT_DAILY_LIMIT = 20;

function strictOriginOk(req: Request) {
  return req.headers.get("origin") === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const links = await prisma.shortUrl.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    links: links.map((link) => ({
      id: link.id,
      code: link.code,
      publicUrl: buildShortUrlPublicUrl(link.code),
      targetUrl: link.targetUrl,
      title: link.title,
      clicks: link.clicks,
      createdAt: link.createdAt,
      disabled: Boolean(link.disabledAt),
      disabledReason: link.disabledReason,
      reportCount: link.reportCount,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!strictOriginOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as { id: string }).id;

  const ip = requestIp(req.headers);
  // Per-IP limiter (grep sharedRateLimit) on top of the per-account 24h cap
  // below - stops one IP hammering the endpoint across many accounts.
  if (!(await sharedRateLimit(`short-url-create-ip:${ip}`, 30, 60 * 60_000))) {
    return NextResponse.json({ error: "Too many links created from this connection. Please wait a while and try again." }, { status: 429 });
  }
  // In-process burst limiter too, same spirit as the redirect routes.
  if (!rateLimit(`short-url-create-burst:${userId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Please slow down - try again in a minute." }, { status: 429 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60_000);
  const usedToday = await prisma.shortUrl.count({ where: { userId, createdAt: { gte: since24h } } });
  if (usedToday >= ACCOUNT_DAILY_LIMIT) {
    return NextResponse.json({ error: `You've created ${ACCOUNT_DAILY_LIMIT} short links in the last 24 hours. Please try again later.` }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.targetUrl !== "string") {
    return NextResponse.json({ error: "Enter a URL to shorten." }, { status: 400 });
  }

  const validation = validateTargetUrl(body.targetUrl);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  // Validate the requested custom name (cheap, offline) before the Safe
  // Browsing network call, so a bad name fails fast either way.
  const requestedCode = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
  if (requestedCode && !isValidCustomCode(requestedCode)) {
    return NextResponse.json({ error: "Custom names use only a-z, 0-9 and dashes, 3-40 characters, and can't be a reserved word." }, { status: 400 });
  }

  // Google Safe Browsing (audit item 4c) - see lib/safe-browsing.ts for the
  // fail-open behaviour on a missing key or an API error/timeout.
  const { checkSafeBrowsing } = await import("@/lib/safe-browsing");
  const verdict = await checkSafeBrowsing(validation.url.toString());
  if (verdict.blocked) {
    return NextResponse.json({ error: "This link was flagged as unsafe by Google Safe Browsing and can't be shortened." }, { status: 400 });
  }

  let code: string;
  if (requestedCode) {
    const existing = await prisma.shortUrl.findUnique({ where: { code: requestedCode }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "That name is already taken. Try another." }, { status: 409 });
    code = requestedCode;
  } else {
    code = randomShortCode();
    let attempts = 0;
    while (await prisma.shortUrl.findUnique({ where: { code }, select: { id: true } })) {
      code = randomShortCode();
      if (++attempts > 10) return NextResponse.json({ error: "Could not generate a short code. Please try again." }, { status: 503 });
    }
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : null;

  try {
    const link = await prisma.shortUrl.create({
      data: { userId, code, targetUrl: validation.url.toString(), title },
    });
    return NextResponse.json({
      id: link.id,
      code: link.code,
      publicUrl: buildShortUrlPublicUrl(link.code),
      targetUrl: link.targetUrl,
      title: link.title,
      clicks: link.clicks,
      createdAt: link.createdAt,
      disabled: false,
      reportCount: 0,
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "That name is already taken. Try another." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!strictOriginOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as { id: string }).id;
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await prisma.shortUrl.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
