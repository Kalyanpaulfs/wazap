import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { marketplaceContext, marketplaceMutationAllowed } from "@/lib/marketplace";
import { cleanInboxText } from "@/lib/inbox";
import { rateLimit } from "@/lib/rate-limit";
import { recordFunnelEvent } from "@/lib/funnel";

export async function POST(req: Request) {
  if (!marketplaceMutationAllowed(req))
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`marketplace-review:${ctx.workspaceId}`, 10, 60_000))
    return NextResponse.json({ error: "Too many review changes. Try again shortly." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const install = await prisma.marketplaceInstall.findFirst({
    where: {
      id: String(body.installId || ""),
      workspaceId: ctx.workspaceId,
      status: "active",
      lastTestedAt: { not: null },
    },
    select: { listingId: true, id: true },
  });
  if (!install)
    return NextResponse.json({ error: "Test this installed package before reviewing it." }, { status: 403 });
  const rating = Math.round(Number(body.rating));
  if (rating < 1 || rating > 5)
    return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
  const review = await prisma.marketplaceReview.upsert({
    where: { listingId_workspaceId: { listingId: install.listingId, workspaceId: ctx.workspaceId } },
    create: {
      listingId: install.listingId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      rating,
      title: cleanInboxText(body.title, 100),
      body: cleanInboxText(body.body, 1000),
    },
    update: {
      userId: ctx.userId,
      rating,
      title: cleanInboxText(body.title, 100),
      body: cleanInboxText(body.body, 1000),
      status: "published",
    },
  });
  await recordFunnelEvent("marketplace_review_submitted", {
    userId: ctx.userId,
    source: "marketplace",
    metadata: { listingId: install.listingId, rating },
  });
  return NextResponse.json({ review, verifiedInstall: true }, { status: 201 });
}
