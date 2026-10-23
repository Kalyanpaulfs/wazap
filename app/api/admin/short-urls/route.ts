import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildShortUrlPublicUrl } from "@/lib/short-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const admin = session?.user as { id?: string; isAdmin?: boolean } | undefined;
  return admin?.isAdmin ? admin : null;
}

// GET: read-only, admin session is enough (matches the other admin list
// endpoints - the strict origin check below is reserved for the mutating
// PATCH, per audit item 4g).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const links = await prisma.shortUrl.findMany({
    orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: { user: { select: { email: true } } },
  });
  return NextResponse.json({
    links: links.map((link) => ({
      id: link.id,
      code: link.code,
      publicUrl: buildShortUrlPublicUrl(link.code),
      targetUrl: link.targetUrl,
      ownerEmail: link.user.email,
      clicks: link.clicks,
      reportCount: link.reportCount,
      createdAt: link.createdAt,
      disabled: Boolean(link.disabledAt),
      disabledReason: link.disabledReason,
    })),
  });
}

// PATCH: disable/enable a short link (admin-only, owner-agnostic). Same
// admin auth + strict origin check as the other admin APIs that mutate
// data (app/api/rotator/route.ts is the reference implementation named in
// the spec) - deliberately NOT the looser sameSiteRequest helper.
export async function PATCH(req: Request) {
  if (req.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  if (typeof body?.disabled !== "boolean") return NextResponse.json({ error: "Invalid disabled value." }, { status: 400 });

  // Re-enabling deliberately leaves reportCount as-is (full history stays
  // visible, and the auto-disable in app/api/short-urls/report/route.ts
  // will correctly fire again if it collects another report past the
  // threshold) - only disabledAt/disabledReason actually gate the redirect.
  const data = body.disabled
    ? { disabledAt: new Date(), disabledReason: "admin" }
    : { disabledAt: null, disabledReason: null };
  const result = await prisma.shortUrl.updateMany({ where: { id }, data });
  if (!result.count) return NextResponse.json({ error: "Short link not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
