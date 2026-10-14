import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  MARKETPLACE_INSTALL_LIMITS,
  marketplaceContext,
  marketplaceMutationAllowed,
} from "@/lib/marketplace";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { rateLimit } from "@/lib/rate-limit";
import { recordFunnelEvent } from "@/lib/funnel";

const AGENT_LIMITS: Record<string, number> = {
  free: 1,
  basic: 1,
  pro: 3,
  ultimate: 10,
  business: 25,
};

class MarketplaceInstallError extends Error {
  constructor(public code: "INSTALL_LIMIT" | "AI_AGENT_LIMIT") {
    super(code);
  }
}

export async function GET() {
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const installs = await prisma.marketplaceInstall.findMany({
    where: { workspaceId: ctx.workspaceId, status: { in: ["active", "suspended", "revoked"] } },
    orderBy: { installedAt: "desc" },
    include: {
      listing: { select: { id: true, name: true, slug: true, packageType: true, requestedScopes: true, manifest: true, pricingModel: true, status: true } },
      version: { select: { version: true } },
    },
  });
  return NextResponse.json({ installs, limit: MARKETPLACE_INSTALL_LIMITS[ctx.plan] || 1 });
}

export async function POST(req: Request) {
  if (!marketplaceMutationAllowed(req)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Owner or admin approval is required to install marketplace access." }, { status: 403 });
  if (!rateLimit(`marketplace-install:${ctx.workspaceId}`, 30, 60_000)) return NextResponse.json({ error: "Too many marketplace changes. Try again shortly." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const listingId = String(body.listingId || "");
  const listing = await prisma.marketplaceListing.findFirst({
    where: { id: listingId, status: "published", pricingModel: "free" },
    include: { versions: { where: { status: "published" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!listing || !listing.versions[0]) return NextResponse.json({ error: "Published free package version not found." }, { status: 404 });
  if (!["agent", "external_tool"].includes(listing.packageType)) return NextResponse.json({ error: "This package type is not installable yet." }, { status: 409 });

  const manifest = listing.versions[0].manifest as Record<string, unknown>;
  let created = false;
  try {
    const install = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${ctx.workspaceId}))`);
      const existing = await tx.marketplaceInstall.findUnique({ where: { workspaceId_listingId: { workspaceId: ctx.workspaceId, listingId } } });
      if (existing?.status === "active") return existing;
      const active = await tx.marketplaceInstall.count({ where: { workspaceId: ctx.workspaceId, status: "active", planPausedAt: null } });
      const limit = MARKETPLACE_INSTALL_LIMITS[ctx.plan] || 1;
      if (active >= limit) throw new MarketplaceInstallError("INSTALL_LIMIT");

      let installedAgentId: string | null = existing?.installedAgentId || null;
      if (listing.packageType === "agent" && !installedAgentId) {
        const agentLimit = AGENT_LIMITS[ctx.plan] || 1;
        if ((await tx.aiAgent.count({ where: { workspaceId: ctx.workspaceId } })) >= agentLimit) throw new MarketplaceInstallError("AI_AGENT_LIMIT");
        const agent = await tx.aiAgent.create({ data: {
          workspaceId: ctx.workspaceId,
          name: String(manifest.name || listing.name).slice(0, 80),
          roleType: String(manifest.roleType || "sales_rep").slice(0, 40),
          instructions: String(manifest.instructions || listing.description).slice(0, 6000),
          tone: String(manifest.tone || "professional").slice(0, 40),
          responseMode: "draft_only",
          status: "draft",
          allowedTopics: Array.isArray(manifest.allowedTopics) ? manifest.allowedTopics.map(String).slice(0, 30) : [],
          prohibitedTopics: Array.isArray(manifest.prohibitedTopics) ? manifest.prohibitedTopics.map(String).slice(0, 30) : [],
          requireHumanFor: ["payments", "legal commitments", "sensitive personal data"],
        } });
        installedAgentId = agent.id;
      }
      created = true;
      const saved = await tx.marketplaceInstall.upsert({
        where: { workspaceId_listingId: { workspaceId: ctx.workspaceId, listingId } },
        create: { workspaceId: ctx.workspaceId, listingId, versionId: listing.versions[0].id, installedByMemberId: ctx.memberId, installedAgentId, config: {}, status: "active", setupStatus: "installed" },
        update: { versionId: listing.versions[0].id, installedByMemberId: ctx.memberId, installedAgentId, status: "active", setupStatus: "installed", lastTestedAt: null, activatedAt: null, uninstalledAt: null, planPausedAt: null, planPausedFromStatus: null },
      });
      const activeForListing = await tx.marketplaceInstall.count({ where: { listingId, status: "active" } });
      await tx.marketplaceListing.update({ where: { id: listingId }, data: { installCount: activeForListing } });
      return saved;
    });
    if (created) await Promise.all([
      enqueueWebhookEvent(ctx.workspaceId, "marketplace.installed", { installId: install.id, listingId, packageType: listing.packageType }),
      recordFunnelEvent("marketplace_install", { userId: ctx.userId, source: "marketplace", metadata: { installId: install.id, listingId, packageType: listing.packageType } }),
    ]);
    return NextResponse.json({ install, alreadyInstalled: !created }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof MarketplaceInstallError && error.code === "INSTALL_LIMIT") {
      const limit = MARKETPLACE_INSTALL_LIMITS[ctx.plan] || 1;
      return NextResponse.json({ error: `Your ${ctx.plan} plan supports ${limit} active marketplace install${limit === 1 ? "" : "s"}.`, upgrade: true }, { status: 403 });
    }
    if (error instanceof MarketplaceInstallError && error.code === "AI_AGENT_LIMIT") return NextResponse.json({ error: "Your plan's AI agent profile limit is already reached." }, { status: 403 });
    throw error;
  }
}

export async function DELETE(req: Request) {
  if (!marketplaceMutationAllowed(req)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Owner or admin approval is required to uninstall marketplace access." }, { status: 403 });
  if (!rateLimit(`marketplace-install:${ctx.workspaceId}`, 30, 60_000)) return NextResponse.json({ error: "Too many marketplace changes. Try again shortly." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const installId = String(body.id || "");
  const removed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${ctx.workspaceId}))`);
    const install = await tx.marketplaceInstall.findFirst({ where: { id: installId, workspaceId: ctx.workspaceId, status: { in: ["active", "suspended", "revoked"] } } });
    if (!install) return null;
    if (install.installedAgentId) await tx.aiAgent.updateMany({ where: { id: install.installedAgentId, workspaceId: ctx.workspaceId, archivedAt: null }, data: { status: "paused", responseMode: "draft_only", archivedAt: new Date() } });
    await tx.marketplaceInstall.update({ where: { id: install.id }, data: { status: "uninstalled", setupStatus: "uninstalled", uninstalledAt: new Date(), installedAgentId: null, planPausedAt: null, planPausedFromStatus: null } });
    const activeForListing = await tx.marketplaceInstall.count({ where: { listingId: install.listingId, status: "active" } });
    await tx.marketplaceListing.update({ where: { id: install.listingId }, data: { installCount: activeForListing } });
    return install;
  });
  if (!removed) return NextResponse.json({ error: "Active install not found." }, { status: 404 });
  await enqueueWebhookEvent(ctx.workspaceId, "marketplace.uninstalled", { installId: removed.id, listingId: removed.listingId });
  return NextResponse.json({ success: true });
}
