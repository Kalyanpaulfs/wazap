import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  cleanScopes,
  cleanSlug,
  cleanText,
  isValidMarketplaceVersion,
  MARKETPLACE_PACKAGE_TYPES,
  marketplaceMutationAllowed,
  marketplaceContext,
  safeExternalUrl,
} from "@/lib/marketplace";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const ctx = await marketplaceContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const publisher = await prisma.marketplacePublisher.findUnique({
    where: { workspaceId: ctx.workspaceId },
    include: {
      listings: {
        orderBy: { updatedAt: "desc" },
        include: { versions: { orderBy: { createdAt: "desc" } } },
      },
    },
  });
  return NextResponse.json({ publisher });
}

export async function POST(req: Request) {
  if (!marketplaceMutationAllowed(req))
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await marketplaceContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role))
    return NextResponse.json(
      { error: "Owner or admin access required." },
      { status: 403 },
    );
  if (!rateLimit(`marketplace-publisher:${ctx.workspaceId}`, 10, 60_000))
    return NextResponse.json({ error: "Too many marketplace submissions. Try again shortly." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "create_publisher") {
    const displayName = cleanText(body.displayName, 80);
    const slug = cleanSlug(body.slug || displayName);
    if (!displayName || slug.length < 3)
      return NextResponse.json(
        { error: "Publisher name and slug are required." },
        { status: 400 },
      );
    const publisher = await prisma.marketplacePublisher.upsert({
      where: { workspaceId: ctx.workspaceId },
      create: {
        workspaceId: ctx.workspaceId,
        displayName,
        slug,
        description: cleanText(body.description, 500),
        website: safeExternalUrl(body.website),
      },
      update: {
        displayName,
        description: cleanText(body.description, 500),
        website: safeExternalUrl(body.website),
      },
    });
    return NextResponse.json({ publisher }, { status: 201 });
  }
  const publisher = await prisma.marketplacePublisher.findUnique({
    where: { workspaceId: ctx.workspaceId },
  });
  if (!publisher)
    return NextResponse.json(
      { error: "Create a publisher profile first." },
      { status: 409 },
    );
  if (publisher.status === "suspended")
    return NextResponse.json({ error: "This publisher is suspended from submitting packages." }, { status: 423 });
  const name = cleanText(body.name, 90);
  const slug = cleanSlug(body.slug || `${publisher.slug}-${name}`);
  const description = cleanText(body.description, 5000);
  const packageType = MARKETPLACE_PACKAGE_TYPES.includes(body.packageType)
    ? body.packageType
    : "";
  const version = cleanText(body.version, 30) || "1.0.0";
  const pricingModel = "free";
  const launchUrl = safeExternalUrl(body.launchUrl);
  if (!name || slug.length < 3 || description.length < 30 || !packageType)
    return NextResponse.json(
      { error: "Name, slug, supported package type, and a meaningful description are required." },
      { status: 400 },
    );
  if (!isValidMarketplaceVersion(version))
    return NextResponse.json(
      { error: "Use a semantic version such as 1.0.0." },
      { status: 400 },
    );
  if (packageType === "external_tool" && !launchUrl)
    return NextResponse.json(
      {
        error: "Connected tools require a valid public HTTPS launch URL.",
      },
      { status: 400 },
    );
  const manifest =
    packageType === "agent"
      ? {
          name,
          roleType: cleanText(body.roleType, 40) || "sales_rep",
          instructions: cleanText(body.instructions, 6000) || description,
          tone: "professional",
        }
      : {
          name,
          description,
          launchUrl,
          integration: "external",
        };
  const manifestHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  if (body.action === "submit_version") {
    const existing = await prisma.marketplaceListing.findFirst({ where: { id: String(body.listingId || ""), publisherId: publisher.id, status: { not: "removed" } } });
    if (!existing) return NextResponse.json({ error: "Publisher listing not found or no longer accepts versions." }, { status: 404 });
    if (existing.packageType !== packageType) return NextResponse.json({ error: "A package type cannot change between versions." }, { status: 409 });
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.marketplaceVersion.create({ data: { listingId: existing.id, version, manifest, manifestHash, changelog: cleanText(body.changelog, 1000), status: "pending_review", securityReviewStatus: "pending" } });
      await tx.marketplaceListing.update({ where: { id: existing.id }, data: { submittedAt: new Date() } });
      return item;
    });
    return NextResponse.json({ version: created, existingListingPreserved: existing.status === "published" }, { status: 201 });
  }
  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.marketplaceListing.create({
      data: {
        publisherId: publisher.id,
        name,
        slug,
        summary: cleanText(body.summary, 180) || description.slice(0, 180),
        description,
        category: cleanText(body.category, 40) || "productivity",
        packageType,
        pricingModel,
        requestedScopes: cleanScopes(body.requestedScopes),
        manifest,
        status: "pending_review",
        submittedAt: new Date(),
      },
    });
    await tx.marketplaceVersion.create({
      data: {
        listingId: created.id,
        version,
        manifest,
        changelog: cleanText(body.changelog, 1000),
        status: "pending_review",
        manifestHash,
        securityReviewStatus: "pending",
      },
    });
    return created;
  });
  return NextResponse.json({ listing }, { status: 201 });
}
