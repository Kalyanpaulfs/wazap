import {captureCrmLead} from "@/lib/crm";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { recordFunnelEvent } from "@/lib/funnel";
import bcrypt from "bcryptjs";
import { renderWelcomeEmail } from "@/lib/email";
import { newProductTrial, PRODUCT_TRIAL_DAYS, PRODUCT_TRIAL_PLAN } from "@/lib/entitlements";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { PARTNER_ATTRIBUTION_WINDOW_DAYS, PARTNER_TERMS_VERSION, partnerTokenHash, readPartnerTouchCookie } from "@/lib/partner-attribution";
import { requestIp } from "@/lib/request-ip";

function strongPassword(value: string) {
  return value.length >= 10 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

function cleanAttribution(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const clean = (key: string, max = 100) => String(input[key] ?? "").trim().slice(0, max);
  return {
    source: clean("source"),
    medium: clean("medium"),
    campaign: clean("campaign"),
    content: clean("content"),
    term: clean("term"),
    gclid: clean("gclid", 200),
    landingPage: clean("landingPage", 200),
  };
}

export async function POST(req: Request) {
  try {
    const ip = requestIp(req.headers);
    if (!rateLimit(`signup:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
    }
    const { name, email, password, attribution: rawAttribution } = await req.json();
    const attribution = cleanAttribution(rawAttribution);
    const partnerTouchToken = readPartnerTouchCookie(req);
    if (!email || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (!strongPassword(String(password))) return NextResponse.json({ error: "Use at least 10 characters with uppercase, lowercase, and a number." }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });

    const hashed = await bcrypt.hash(String(password), 12);
    const createdAccount = await prisma.$transaction(async (tx) => {
      const trial = newProductTrial();
      const created = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashed,
          name: name || null,
          ...trial,
        },
      });
      const crmLead=await captureCrmLead(tx,{name:created.name||created.email,email:created.email,source:"signup"});
      await tx.crmActivity.create({data:{leadId:crmLead.id,kind:"signup",body:"Wazap account created.",sourceKey:`signup:${created.id}`}});
      const workspace = await tx.workspace.create({
        data: {
          name: `${String(name || email.split("@")[0]).trim().slice(0, 70)}'s workspace`,
          slug: `workspace-${created.id.slice(-12).toLowerCase()}`,
          ownerId: created.id,
        },
      });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: created.id, role: "owner" } });
      const updated = await tx.user.update({ where: { id: created.id }, data: { activeWorkspaceId: workspace.id } });
      let partnerAttribution: { id: string; partnerWorkspaceId: string } | null = null;
      if (partnerTouchToken) {
        const touch = await tx.partnerReferralTouch.findUnique({ where: { tokenHash: partnerTokenHash(partnerTouchToken) }, include: { partner: true } });
        if (touch && !touch.claimedAt && !touch.claimedWorkspaceId && touch.expiresAt > new Date() && touch.partner.status === "active" && touch.partner.termsVersion === PARTNER_TERMS_VERSION && touch.partner.termsAcceptedAt && touch.partner.attributionWindowDays === PARTNER_ATTRIBUTION_WINDOW_DAYS) {
          const claim = await tx.partnerReferralTouch.updateMany({ where: { id: touch.id, claimedAt: null, claimedWorkspaceId: null, expiresAt: { gt: new Date() } }, data: { claimedWorkspaceId: workspace.id, claimedAt: new Date() } });
          if (claim.count === 1) {
            const createdAttribution = await tx.partnerAttribution.create({ data: { partnerId: touch.partnerId, attributedWorkspaceId: workspace.id, source: touch.source || "partner", landingPage: touch.landingPage || null, status: "trial" } });
            partnerAttribution = { id: createdAttribution.id, partnerWorkspaceId: touch.partner.workspaceId };
          }
        }
      }
      return { user: updated, workspaceId: workspace.id, partnerAttribution };
    });
    const user = createdAccount.user;

    await recordFunnelEvent("signup_completed", {
      userId: user.id,
      source: attribution?.source || (attribution?.gclid ? "google" : null),
      metadata: attribution || undefined,
    });
    await recordFunnelEvent("trial_started", {
      userId: user.id,
      source: attribution?.source || "signup",
      metadata: { plan: PRODUCT_TRIAL_PLAN, days: PRODUCT_TRIAL_DAYS },
    });
    if (createdAccount.partnerAttribution) {
      await enqueueWebhookEvent(createdAccount.partnerAttribution.partnerWorkspaceId, "partner.trial_attributed", {
        attributionId: createdAccount.partnerAttribution.id,
        attributedWorkspaceId: createdAccount.workspaceId,
        source: attribution?.source || "partner",
      });
    }

    const base = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt";
    const subject = "Welcome to Wazap — your workspace is ready";
    const html = renderWelcomeEmail(user.name, base);
    // Persist first and let the delivery worker handle provider latency/retries.
    // Registration must remain successful if an external email service is down.
    await prisma.outboundEmail.create({ data: { userId: user.id, recipient: user.email, type: "welcome", subject, html } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
