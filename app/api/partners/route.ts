import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanText, marketplaceContext, marketplaceMutationAllowed, safeExternalUrl } from "@/lib/marketplace";
import { partnerSummary } from "@/lib/partner-metrics";
import { rateLimit } from "@/lib/rate-limit";
import { PARTNER_ATTRIBUTION_WINDOW_DAYS, PARTNER_TERMS_VERSION } from "@/lib/partner-attribution";

export async function GET() {
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ...(await partnerSummary(ctx.workspaceId)), policy: { termsVersion: PARTNER_TERMS_VERSION, attributionWindowDays: PARTNER_ATTRIBUTION_WINDOW_DAYS, termsUrl: "/partner-terms", payoutsEnabled: false } });
}

export async function POST(req: Request) {
  if (!marketplaceMutationAllowed(req)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
  if (!rateLimit(`partner-enroll:${ctx.workspaceId}`, 5, 60_000)) return NextResponse.json({ error: "Too many partner changes. Try again shortly." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (body.acceptTerms !== true || body.termsVersion !== PARTNER_TERMS_VERSION) return NextResponse.json({ error: "Accept the current Partner Participation Terms before activating attribution." }, { status: 400 });
  const existing = await prisma.partnerAccount.findUnique({ where: { workspaceId: ctx.workspaceId } });
  if (existing) {
    if (existing.status !== "active" || existing.termsVersion !== PARTNER_TERMS_VERSION || !existing.termsAcceptedAt) {
      const activated = await prisma.$transaction(async (tx) => {
        const changed = await tx.partnerAccount.update({ where: { id: existing.id }, data: { status: "active", termsVersion: PARTNER_TERMS_VERSION, termsAcceptedAt: new Date(), termsAcceptedByUserId: ctx.userId, attributionWindowDays: PARTNER_ATTRIBUTION_WINDOW_DAYS, channel: cleanText(body.channel, 60) || existing.channel, website: safeExternalUrl(body.website) ?? existing.website } });
        await tx.workspaceAuditEvent.create({
          data: { workspaceId: ctx.workspaceId, eventType: "partner_terms_accepted", actorUserId: ctx.userId, metadata: { partnerId: changed.id, termsVersion: PARTNER_TERMS_VERSION, attributionWindowDays: PARTNER_ATTRIBUTION_WINDOW_DAYS, payoutsEnabled: false } },
        });
        return changed;
      });
      return NextResponse.json({ partner: activated, payoutsEnabled: false, notice: "Referral attribution is active. Commission terms and payouts remain disabled until separately agreed." });
    }
    return NextResponse.json({ partner: existing, payoutsEnabled: false });
  }
  const partner = await prisma.$transaction(async (tx) => {
    const created = await tx.partnerAccount.create({
      data: {
        workspaceId: ctx.workspaceId,
        referralCode: `wz-${randomBytes(5).toString("hex")}`,
        status: "active",
        channel: cleanText(body.channel, 60) || null,
        website: safeExternalUrl(body.website),
        termsVersion: PARTNER_TERMS_VERSION,
        termsAcceptedAt: new Date(),
        termsAcceptedByUserId: ctx.userId,
        attributionWindowDays: PARTNER_ATTRIBUTION_WINDOW_DAYS,
      },
    });
    await tx.workspaceAuditEvent.create({
      data: {
        workspaceId: ctx.workspaceId,
        eventType: "partner_tracking_activated",
        actorUserId: ctx.userId,
        metadata: { partnerId: created.id, referralCode: created.referralCode, termsVersion: PARTNER_TERMS_VERSION, attributionWindowDays: PARTNER_ATTRIBUTION_WINDOW_DAYS, payoutsEnabled: false },
      },
    });
    return created;
  });
  return NextResponse.json({
    partner,
    payoutsEnabled: false,
    notice: "Referral attribution is active. Commission terms and payouts remain disabled until separately agreed.",
  }, { status: 201 });
}
