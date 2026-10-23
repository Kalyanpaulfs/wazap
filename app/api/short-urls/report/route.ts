import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestIp } from "@/lib/request-ip";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { isValidReportReason, shouldAutoDisable, hashReporterIp } from "@/lib/short-url-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint (no sign-in needed to report a link) - still a mutating
// API, so it gets the same strict origin check as every other mutating
// route here (audit item 4g), plus a per-IP rate limit (audit item 4e).
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const ip = requestIp(req.headers);
  if (!(await sharedRateLimit(`short-url-report-ip:${ip}`, 10, 60 * 60_000))) {
    return NextResponse.json({ error: "Too many reports from this connection. Please try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
  const reason = body?.reason;
  const details = typeof body?.details === "string" ? body.details.trim().slice(0, 500) : null;
  if (!code) return NextResponse.json({ error: "Missing link code." }, { status: 400 });
  if (!isValidReportReason(reason)) return NextResponse.json({ error: "Choose a reason." }, { status: 400 });

  const link = await prisma.shortUrl.findUnique({ where: { code }, select: { id: true, reportCount: true, disabledAt: true } });
  // Don't reveal whether a code exists either way - same "thanks" response.
  if (!link) return NextResponse.json({ success: true });

  const reporterIp = hashReporterIp(ip);
  // One report per IP per link per rolling 24h (prevents one visitor
  // single-handedly tripping the 3-report auto-disable threshold).
  if (!(await sharedRateLimit(`short-url-report-link:${link.id}:${reporterIp}`, 1, 24 * 60 * 60_000))) {
    return NextResponse.json({ success: true });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.shortUrlReport.create({ data: { shortUrlId: link.id, reason, reporterIp, details } });
    return tx.shortUrl.update({ where: { id: link.id }, data: { reportCount: { increment: 1 } } });
  });

  if (!updated.disabledAt && shouldAutoDisable(updated.reportCount)) {
    await prisma.shortUrl.update({ where: { id: link.id }, data: { disabledAt: new Date(), disabledReason: "reported" } });
  }

  return NextResponse.json({ success: true });
}
