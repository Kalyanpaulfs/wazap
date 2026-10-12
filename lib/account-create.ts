import { captureCrmLead } from "./crm";
import { prisma } from "./prisma";
import { recordFunnelEvent } from "./funnel";
import { renderWelcomeEmail } from "./email";
import { newProductTrial, PRODUCT_TRIAL_DAYS, PRODUCT_TRIAL_PLAN } from "./entitlements";
import { enqueueWebhookEvent } from "./developer-platform";
import { PARTNER_ATTRIBUTION_WINDOW_DAYS, PARTNER_TERMS_VERSION, partnerTokenHash } from "./partner-attribution";

export type SignupAttribution = { source: string; medium: string; campaign: string; content: string; term: string; gclid: string; landingPage: string };

export function cleanAttribution(value: unknown): SignupAttribution | null {
  let input = value;
  if (typeof input === "string") { try { input = JSON.parse(input); } catch { return null; } }
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const clean = (key: string, max = 100) => String(record[key] ?? "").trim().slice(0, max);
  return { source: clean("source"), medium: clean("medium"), campaign: clean("campaign"), content: clean("content"), term: clean("term"), gclid: clean("gclid", 200), landingPage: clean("landingPage", 200) };
}

// Creates a verified account with its personal workspace and trial. Called only
// after the email address was proven with a one-time code.
export async function createVerifiedAccount(opts: { email: string; name: string | null; attribution: SignupAttribution | null; partnerTouchToken: string }) {
  const { email, name, attribution, partnerTouchToken } = opts;
  const createdAccount = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, name, emailVerifiedAt: new Date(), ...newProductTrial() } });
    const crmLead = await captureCrmLead(tx, { name: created.name || created.email, email: created.email, source: "signup" });
    await tx.crmActivity.create({ data: { leadId: crmLead.id, kind: "signup", body: "Wazap account created.", sourceKey: `signup:${created.id}` } });
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
  }, { isolationLevel: "Serializable" });
  const user = createdAccount.user;

  // Side effects must never undo a committed signup.
  try {
    await recordFunnelEvent("signup_completed", { userId: user.id, source: attribution?.source || (attribution?.gclid ? "google" : null), metadata: attribution || undefined });
    await recordFunnelEvent("trial_started", { userId: user.id, source: attribution?.source || "signup", metadata: { plan: PRODUCT_TRIAL_PLAN, days: PRODUCT_TRIAL_DAYS } });
    if (createdAccount.partnerAttribution) {
      await enqueueWebhookEvent(createdAccount.partnerAttribution.partnerWorkspaceId, "partner.trial_attributed", {
        attributionId: createdAccount.partnerAttribution.id,
        attributedWorkspaceId: createdAccount.workspaceId,
        source: attribution?.source || "partner",
      });
    }
    const base = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt";
    await prisma.outboundEmail.create({ data: { userId: user.id, recipient: user.email, type: "welcome", subject: "Welcome to Wazap — your workspace is ready", html: renderWelcomeEmail(user.name, base) } });
  } catch (error) {
    console.error("[signup] post-signup side effect failed", error instanceof Error ? error.message : error);
  }
  return user;
}
