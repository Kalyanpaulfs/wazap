import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanText, marketplaceContext, marketplaceMutationAllowed } from "@/lib/marketplace";
import { rateLimit } from "@/lib/rate-limit";

const CATEGORIES = ["security", "privacy", "spam", "deceptive", "unsafe_output", "policy", "other"];

export async function GET() {
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const reports = await prisma.marketplaceAbuseReport.findMany({ where: { workspaceId: ctx.workspaceId, reporterUserId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, listingId: true, category: true, details: true, status: true, resolution: true, resolvedAt: true, createdAt: true } });
  return NextResponse.json({ reports, categories: CATEGORIES });
}

export async function POST(req: Request) {
  if (!marketplaceMutationAllowed(req)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`marketplace-abuse:${ctx.userId}`, 5, 24 * 60 * 60_000)) return NextResponse.json({ error: "Report limit reached. Contact support for an urgent safety incident." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "other";
  const details = cleanText(body.details, 2000);
  if (details.length < 20) return NextResponse.json({ error: "Describe the issue in at least 20 characters without including secrets or full customer conversations." }, { status: 400 });
  const listing = await prisma.marketplaceListing.findFirst({ where: { id: String(body.listingId || ""), status: { in: ["published", "suspended", "removed"] } }, select: { id: true } });
  if (!listing) return NextResponse.json({ error: "Marketplace package not found." }, { status: 404 });
  const report = await prisma.marketplaceAbuseReport.create({ data: { listingId: listing.id, workspaceId: ctx.workspaceId, reporterUserId: ctx.userId, category, details } });
  return NextResponse.json({ report: { id: report.id, status: report.status, createdAt: report.createdAt }, notice: "Report recorded for administrator review." }, { status: 201 });
}
