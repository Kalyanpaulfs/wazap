import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MARKETPLACE_PACKAGE_TYPES, MARKETPLACE_SCOPES, marketplaceMutationAllowed } from "@/lib/marketplace";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { rateLimit } from "@/lib/rate-limit";

async function admin() {
  const session = await getServerSession(authOptions);
  return session?.user as { id?: string; isAdmin?: boolean } | undefined;
}

const SECURITY_CHECKS = ["manifestReviewed", "scopesLeastPrivilege", "externalEndpointsReviewed", "dataHandlingReviewed", "humanApprovalReviewed"] as const;
function securityEvidence(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(SECURITY_CHECKS.map((key) => [key, source[key] === true]));
}

export async function GET() {
  const user = await admin();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [listings, reports] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where: { OR: [{ status: { in: ["pending_review", "published", "suspended", "removed"] } }, { versions: { some: { status: "pending_review" } } }] },
      include: { publisher: true, versions: { orderBy: { createdAt: "desc" } }, _count: { select: { installs: true, abuseReports: { where: { status: "open" } } } } },
      orderBy: { updatedAt: "desc" }, take: 100,
    }),
    prisma.marketplaceAbuseReport.findMany({ where: { status: "open" }, include: { listing: { select: { id: true, name: true, slug: true, status: true } } }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);
  return NextResponse.json({ listings, reports, securityChecks: SECURITY_CHECKS });
}

export async function PATCH(req: Request) {
  if (!marketplaceMutationAllowed(req)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const user = await admin();
  if (!user?.isAdmin || !user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rateLimit(`admin-marketplace:${user.id}`, 60, 60_000)) return NextResponse.json({ error: "Too many moderation changes." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || (body.decision ? "review" : ""));
  const notes = String(body.notes || body.reason || "").trim().slice(0, 1000);

  if (action === "resolve_report") {
    if (notes.length < 8) return NextResponse.json({ error: "Record a resolution of at least 8 characters." }, { status: 400 });
    const report = await prisma.marketplaceAbuseReport.findFirst({ where: { id: String(body.reportId || ""), status: "open" } });
    if (!report) return NextResponse.json({ error: "Open abuse report not found." }, { status: 404 });
    await prisma.marketplaceAbuseReport.update({ where: { id: report.id }, data: { status: body.outcome === "dismissed" ? "dismissed" : "resolved", resolution: notes, resolvedByUserId: user.id, resolvedAt: new Date() } });
    return NextResponse.json({ success: true });
  }

  const listing = await prisma.marketplaceListing.findFirst({ where: { id: String(body.id || "") }, include: { versions: { orderBy: { createdAt: "desc" } }, installs: { where: { status: { in: ["active", "suspended"] } }, select: { id: true, workspaceId: true, installedAgentId: true, status: true } } } });
  if (!listing) return NextResponse.json({ error: "Marketplace listing not found." }, { status: 404 });

  if (action === "review") {
    const decision = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "";
    if (!decision) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
    const version = listing.versions.find((item) => item.id === String(body.versionId || "")) || listing.versions.find((item) => item.status === "pending_review" || item.securityReviewStatus === "legacy_review_required");
    if (!version || (version.status !== "pending_review" && version.securityReviewStatus !== "legacy_review_required")) return NextResponse.json({ error: "Reviewable version not found." }, { status: 404 });
    const scopesValid = listing.requestedScopes.every((scope) => MARKETPLACE_SCOPES.includes(scope as (typeof MARKETPLACE_SCOPES)[number]));
    const typeValid = MARKETPLACE_PACKAGE_TYPES.includes(listing.packageType as (typeof MARKETPLACE_PACKAGE_TYPES)[number]);
    const evidence = securityEvidence(body.securityEvidence);
    const evidenceComplete = SECURITY_CHECKS.every((key) => evidence[key]);
    const riskLevel = ["low", "medium", "high"].includes(body.riskLevel) ? body.riskLevel : "medium";
    if (decision === "approved" && (!scopesValid || !typeValid || listing.pricingModel !== "free" || !evidenceComplete || notes.length < 8))
      return NextResponse.json({ error: "Approval requires supported scopes/type/pricing, every security check, and review notes." }, { status: 409 });
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (decision === "approved") {
        await tx.marketplaceVersion.updateMany({ where: { listingId: listing.id, status: "published", id: { not: version.id } }, data: { status: "superseded", withdrawnAt: now } });
        const manifestHash = version.manifestHash || createHash("sha256").update(JSON.stringify(version.manifest)).digest("hex");
        await tx.marketplaceVersion.update({ where: { id: version.id }, data: { status: "published", manifestHash, securityReviewStatus: "approved", securityEvidence: evidence as Prisma.InputJsonValue, riskLevel, reviewedAt: now, publishedAt: now, withdrawnAt: null } });
        await tx.marketplaceListing.update({ where: { id: listing.id }, data: { status: "published", manifest: version.manifest as Prisma.InputJsonValue, reviewNotes: notes, publishedAt: listing.publishedAt || now, suspendedAt: null, removedAt: null, removalReason: null } });
        await tx.marketplacePublisher.update({ where: { id: listing.publisherId }, data: { status: "approved" } });
      } else {
        await tx.marketplaceVersion.update({ where: { id: version.id }, data: { status: "rejected", securityReviewStatus: "rejected", riskLevel, reviewedAt: now, withdrawnAt: now } });
        const hasPublished = listing.versions.some((item) => item.id !== version.id && item.status === "published");
        if (!hasPublished) await tx.marketplaceListing.update({ where: { id: listing.id }, data: { status: version.securityReviewStatus === "legacy_review_required" ? "suspended" : "rejected", reviewNotes: notes, suspendedAt: version.securityReviewStatus === "legacy_review_required" ? now : null, removalReason: version.securityReviewStatus === "legacy_review_required" ? notes : null } });
      }
      await tx.marketplaceModeration.create({ data: { listingId: listing.id, versionId: version.id, reviewerUserId: user.id!, decision, notes, riskLevel, securityEvidence: evidence as Prisma.InputJsonValue } });
    });
    return NextResponse.json({ success: true, versionId: version.id, decision });
  }

  if (action === "rollback") {
    if (notes.length < 8) return NextResponse.json({ error: "Record a rollback reason of at least 8 characters." }, { status: 400 });
    const version = listing.versions.find((item) => item.id === String(body.versionId || ""));
    if (!version || version.securityReviewStatus !== "approved") return NextResponse.json({ error: "Only a security-approved version can be restored." }, { status: 409 });
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.marketplaceVersion.updateMany({ where: { listingId: listing.id, status: "published", id: { not: version.id } }, data: { status: "superseded", withdrawnAt: now } });
      await tx.marketplaceVersion.update({ where: { id: version.id }, data: { status: "published", publishedAt: now, withdrawnAt: null } });
      await tx.marketplaceListing.update({ where: { id: listing.id }, data: { status: "published", manifest: version.manifest as Prisma.InputJsonValue, suspendedAt: null, removedAt: null, removalReason: null } });
      await tx.marketplaceInstall.updateMany({ where: { listingId: listing.id, status: { in: ["active", "suspended"] } }, data: { versionId: version.id, status: "suspended", setupStatus: "requires_review", suspendedAt: now, statusReason: `Version rollback: ${notes}` } });
      const agentIds = listing.installs.map((item) => item.installedAgentId).filter((id): id is string => Boolean(id));
      if (agentIds.length) await tx.aiAgent.updateMany({ where: { id: { in: agentIds } }, data: { status: "paused", responseMode: "draft_only" } });
      await tx.marketplaceModeration.create({ data: { listingId: listing.id, versionId: version.id, reviewerUserId: user.id!, decision: "rollback", notes, riskLevel: version.riskLevel } });
    });
    await Promise.all(listing.installs.map((install) => enqueueWebhookEvent(install.workspaceId, "marketplace.package_rolled_back", { listingId: listing.id, installId: install.id, versionId: version.id, requiresReview: true })));
    return NextResponse.json({ success: true, affectedInstalls: listing.installs.length, agentsPaused: true });
  }

  if (["suspend", "remove"].includes(action)) {
    if (notes.length < 8) return NextResponse.json({ error: "Record a clear safety or policy reason." }, { status: 400 });
    const now = new Date(), removed = action === "remove";
    await prisma.$transaction(async (tx) => {
      await tx.marketplaceListing.update({ where: { id: listing.id }, data: { status: removed ? "removed" : "suspended", suspendedAt: now, removedAt: removed ? now : null, removalReason: notes, installCount: 0 } });
      await tx.marketplaceInstall.updateMany({ where: { listingId: listing.id, status: { in: ["active", "suspended"] } }, data: { status: removed ? "revoked" : "suspended", setupStatus: removed ? "revoked" : "suspended", suspendedAt: now, statusReason: notes } });
      const agentIds = listing.installs.map((item) => item.installedAgentId).filter((id): id is string => Boolean(id));
      if (agentIds.length) await tx.aiAgent.updateMany({ where: { id: { in: agentIds } }, data: { status: "paused", responseMode: "draft_only" } });
      await tx.marketplaceModeration.create({ data: { listingId: listing.id, reviewerUserId: user.id!, decision: removed ? "removed" : "suspended", notes } });
    });
    const event = removed ? "marketplace.package_removed" : "marketplace.package_suspended";
    await Promise.all(listing.installs.map((install) => enqueueWebhookEvent(install.workspaceId, event, { listingId: listing.id, installId: install.id, reason: notes, agentsPaused: true })));
    return NextResponse.json({ success: true, affectedInstalls: listing.installs.length, status: removed ? "removed" : "suspended" });
  }

  return NextResponse.json({ error: "Unsupported moderation action." }, { status: 400 });
}
