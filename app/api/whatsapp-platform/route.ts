import { NextResponse } from "next/server";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanContactAddress, cleanInboxText, currentInboxContext } from "@/lib/inbox";
import { CHANNEL_LIMITS, createChannelCredential } from "@/lib/channels";
import { discoverMetaAssets, exchangeEmbeddedSignupCode, encryptSecret, metaProviderReadiness, verifyMetaAssets, createMetaTemplate, listMetaTemplates } from "@/lib/meta-cloud";
import { rateLimit } from "@/lib/rate-limit";
import { effectivePlan } from "@/lib/entitlements";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { TOOL_LIMITS } from "@/lib/tool-access";

const MIGRATION_ROW_LIMIT = 500;
type MigrationRow = { name: string; phone: string; email: string | null };

function migrationRows(input: unknown) {
  const rows = Array.isArray(input) ? input.slice(0, MIGRATION_ROW_LIMIT) : [];
  const unique = new Map<string, MigrationRow>();
  let rejected = 0, duplicateRows = 0;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") { rejected += 1; continue; }
    const row = raw as Record<string, unknown>;
    const phone = cleanContactAddress(row.phone);
    if (phone.length < 7) { rejected += 1; continue; }
    if (unique.has(phone)) { duplicateRows += 1; continue; }
    const emailValue = cleanInboxText(row.email, 160).toLowerCase();
    const email = emailValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue) ? emailValue : null;
    unique.set(phone, { name: cleanInboxText(row.name, 120) || "Imported contact", phone, email });
  }
  const normalized = [...unique.values()].sort((a, b) => a.phone.localeCompare(b.phone));
  const fingerprint = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return { received: rows.length, normalized, rejected, duplicateRows, fingerprint, truncated: Array.isArray(input) && input.length > MIGRATION_ROW_LIMIT };
}

function leadLimit(plan: string) {
  const key = plan === "business" ? "ultimate" : plan as keyof typeof TOOL_LIMITS.leads;
  return TOOL_LIMITS.leads[key]?.uses ?? TOOL_LIMITS.leads.free.uses;
}

async function context() {
  const ctx = await currentInboxContext();
  if (!ctx) return null;
  const workspace = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, include: { owner: { select: { plan: true, trialPlan: true, trialEndsAt: true } } } });
  return workspace ? { ...ctx, plan: effectivePlan(workspace.owner) } : null;
}
const owner = (role: string) => ["owner", "admin"].includes(role);
const config = (value: unknown) => (value && typeof value === "object" ? value as Record<string, unknown> : {});
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

function oauthState(payload: Record<string, unknown>) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", process.env.NEXTAUTH_SECRET || "").update(value).digest("base64url");
  return `${value}.${signature}`;
}
function verifyOauthState(value: string) {
  const [payload, supplied] = value.split(".");
  if (!payload || !supplied || !process.env.NEXTAUTH_SECRET) return null;
  const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: string; workspaceId: string; nonce: string; exp: number }; } catch { return null; }
}
function cookie(req: Request, name: string) {
  return req.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

export async function GET(req: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (new URL(req.url).searchParams.get("meta_oauth") === "start") {
    if (!owner(ctx.role)) return NextResponse.json({ error: "Workspace owner or admin access required." }, { status: 403 });
    const readiness = metaProviderReadiness();
    if (!readiness.configured) return NextResponse.json({ error: "Meta provider setup is incomplete." }, { status: 503 });
    const nonce = randomBytes(24).toString("base64url");
    const state = oauthState({ userId: ctx.userId, workspaceId: ctx.workspaceId, nonce, exp: Date.now() + 10 * 60_000 });
    const redirectUri = `${process.env.NEXTAUTH_URL || "https://wazap.lt"}/whatsapp`;
    const params = new URLSearchParams({ client_id: String(readiness.appId), redirect_uri: redirectUri, response_type: "code", config_id: String(readiness.configId), override_default_response_type: "true", state });
    const response = NextResponse.json({ authorizationUrl: `https://www.facebook.com/${readiness.graphVersion}/dialog/oauth?${params}` });
    response.cookies.set("wazap_meta_oauth", nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    return response;
  }
  const [connections, templates, consents, campaigns, migrations] = await Promise.all([
    prisma.channelConnection.findMany({ where: { workspaceId: ctx.workspaceId, provider: "meta_cloud", status: { not: "disabled" } }, select: { id: true, displayName: true, status: true, capabilities: true, externalAccountId: true, config: true, lastVerifiedAt: true, lastEventAt: true, lastError: true }, orderBy: { createdAt: "desc" } }),
    prisma.whatsAppTemplate.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.whatsAppConsent.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { updatedAt: "desc" }, take: 250 }),
    prisma.whatsAppCampaign.findMany({ where: { workspaceId: ctx.workspaceId }, include: { _count: { select: { recipients: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.whatsAppMigration.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return NextResponse.json({ provider: metaProviderReadiness(), webhookUrl: `${process.env.NEXTAUTH_URL || "https://wazap.lt"}/api/meta/webhook`, role: ctx.role, plan: ctx.plan, connections, templates, consents, campaigns, migrations });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!owner(ctx.role)) return NextResponse.json({ error: "Workspace owner or admin access required." }, { status: 403 });
  if (!rateLimit(`meta-platform:${ctx.workspaceId}`, 30, 60_000)) return NextResponse.json({ error: "Too many changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  try {
    if (action === "connect_redirect") {
      const readiness = metaProviderReadiness();
      if (!readiness.configured) return NextResponse.json({ error: "Meta provider setup is incomplete." }, { status: 503 });
      const state = verifyOauthState(cleanInboxText(body.state, 4000));
      const nonce = cookie(req, "wazap_meta_oauth");
      if (!state || state.exp < Date.now() || state.userId !== ctx.userId || state.workspaceId !== ctx.workspaceId || !nonce || nonce !== state.nonce) return NextResponse.json({ error: "Meta authorization expired or failed its security check. Start the connection again." }, { status: 400 });
      const code = cleanInboxText(body.code, 4000);
      if (!code) return NextResponse.json({ error: "Meta did not return an authorization code." }, { status: 400 });
      const redirectUri = `${process.env.NEXTAUTH_URL || "https://wazap.lt"}/whatsapp`;
      const token = await exchangeEmbeddedSignupCode(code, redirectUri);
      const accounts = await discoverMetaAssets(token);
      const candidates = accounts.flatMap(({ waba, phones }) => phones.map((phone) => ({ waba, phone })));
      const verifiedCandidates = candidates.filter(({ phone }) => String(phone.code_verification_status || "").toUpperCase() === "VERIFIED");
      const selected = candidates.length === 1 ? candidates[0] : verifiedCandidates.length === 1 ? verifiedCandidates[0] : null;
      if (!selected) return NextResponse.json({ error: candidates.length ? "Meta shared multiple WhatsApp numbers and Wazap could not identify one uniquely verified Cloud API number. Select one verified number in Embedded Signup." : "Meta authorization completed but no shared WhatsApp phone number was found. Select a WABA and phone number during authorization." }, { status: 409 });
      const { waba, phone } = selected;
      const wabaId = String(waba.id || ""), phoneNumberId = String(phone.id || "");
      const duplicate = await prisma.channelConnection.findFirst({ where: { workspaceId: ctx.workspaceId, provider: "meta_cloud", externalAccountId: phoneNumberId, status: { not: "disabled" } } });
      if (duplicate) return NextResponse.json({ notice: "This WhatsApp number is already connected.", connection: { id: duplicate.id, status: duplicate.status } });
      const credential = createChannelCredential();
      const connection = await prisma.channelConnection.create({ data: {
        workspaceId: ctx.workspaceId, createdByMemberId: ctx.memberId, channel: "whatsapp", provider: "meta_cloud",
        displayName: cleanInboxText(phone.verified_name, 80) || "WhatsApp Business", externalAccountId: phoneNumberId, status: "active",
        capabilities: ["receive", "send", "delivery_receipts", "templates", "campaigns"], signingSecretEncrypted: credential.encrypted,
        accessTokenEncrypted: encryptSecret(token), secretPrefix: "meta_managed", webhookPathToken: credential.pathToken, lastVerifiedAt: new Date(),
        config: { wabaId, phoneNumberId, businessName: waba.name || null, displayPhoneNumber: phone.display_phone_number || null, qualityRating: phone.quality_rating || null, billing: "direct_meta" },
      } });
      const response = NextResponse.json({ connection: { id: connection.id, status: connection.status }, notice: "Customer-owned WABA verified and connected through Meta." }, { status: 201 });
      response.cookies.set("wazap_meta_oauth", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
      return response;
    }
    if (action === "connect") {
      const readiness = metaProviderReadiness();
      if (!readiness.configured) return NextResponse.json({ error: "Meta provider setup is required before Embedded Signup can connect a WABA.", missing: readiness.missing }, { status: 503 });
      const code = cleanInboxText(body.code, 2000), wabaId = cleanInboxText(body.wabaId, 120), phoneNumberId = cleanInboxText(body.phoneNumberId, 120);
      if (!code || !wabaId || !phoneNumberId) return NextResponse.json({ error: "Embedded Signup code, WABA ID and phone number ID are required." }, { status: 400 });
      const activeConnections = await prisma.channelConnection.count({ where: { workspaceId: ctx.workspaceId, status: { not: "disabled" } } });
      const limit = CHANNEL_LIMITS[ctx.plan] || 1;
      if (activeConnections >= limit) return NextResponse.json({ error: `Your ${ctx.plan} plan supports ${limit} channel connection${limit === 1 ? "" : "s"}.`, upgrade: true }, { status: 403 });
      const redirectUri = `${process.env.NEXTAUTH_URL || "https://wazap.lt"}/whatsapp`;
      const token = await exchangeEmbeddedSignupCode(code, redirectUri);
      const assets = await verifyMetaAssets(token, wabaId, phoneNumberId);
      const duplicate = await prisma.channelConnection.findFirst({ where: { workspaceId: ctx.workspaceId, provider: "meta_cloud", externalAccountId: phoneNumberId, status: { not: "disabled" } } });
      if (duplicate) return NextResponse.json({ error: "This WhatsApp phone number is already connected to this workspace." }, { status: 409 });
      const credential = createChannelCredential();
      const connection = await prisma.$transaction(async (tx) => {
        const created = await tx.channelConnection.create({ data: {
          workspaceId: ctx.workspaceId, createdByMemberId: ctx.memberId, channel: "whatsapp", provider: "meta_cloud",
          displayName: cleanInboxText(assets.phone.verified_name, 80) || "WhatsApp Business",
          externalAccountId: phoneNumberId, status: "active", capabilities: ["receive", "send", "delivery_receipts", "templates", "campaigns"],
          signingSecretEncrypted: credential.encrypted, accessTokenEncrypted: encryptSecret(token), secretPrefix: "meta_managed",
          webhookPathToken: credential.pathToken, lastVerifiedAt: new Date(),
          config: { wabaId, phoneNumberId, businessName: assets.waba.name || null, displayPhoneNumber: assets.phone.display_phone_number || null, qualityRating: assets.phone.quality_rating || null, billing: "direct_meta" },
        } });
        await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "channel_created", actorUserId: ctx.userId, metadata: { connectionId: created.id, displayName: created.displayName, channel: created.channel, provider: created.provider } } });
        return created;
      });
      return NextResponse.json({ connection: { id: connection.id, status: connection.status }, notice: "Customer-owned WABA verified. Meta bills messaging charges directly." }, { status: 201 });
    }
    if (action === "sync_templates") {
      const connection = await prisma.channelConnection.findFirst({ where: { id: String(body.connectionId || ""), workspaceId: ctx.workspaceId, provider: "meta_cloud", status: { in: ["active", "paused"] } } });
      if (!connection?.accessTokenEncrypted) return NextResponse.json({ error: "A verified Meta Cloud API connection is required." }, { status: 409 });
      const cfg = config(connection.config), wabaId = String(cfg.wabaId || "");
      if (!wabaId) return NextResponse.json({ error: "This connection has no verified WABA ID." }, { status: 409 });
      const result = await listMetaTemplates(connection.accessTokenEncrypted, wabaId);
      const templates = Array.isArray(result?.data) ? result.data.slice(0, 250) : [];
      for (const item of templates) {
        const name = cleanInboxText(item?.name, 512), language = cleanInboxText(item?.language, 20);
        if (!name || !language) continue;
        await prisma.whatsAppTemplate.upsert({
          where: { connectionId_name_language: { connectionId: connection.id, name, language } },
          create: { workspaceId: ctx.workspaceId, connectionId: connection.id, externalTemplateId: cleanInboxText(item?.id, 120) || null, name, language, category: cleanInboxText(item?.category, 40) || "UNKNOWN", status: cleanInboxText(item?.status, 40).toLowerCase() || "unknown", components: Array.isArray(item?.components) ? item.components : [], rejectionReason: cleanInboxText(item?.rejected_reason, 500) || null, lastSyncedAt: new Date() },
          update: { externalTemplateId: cleanInboxText(item?.id, 120) || null, category: cleanInboxText(item?.category, 40) || "UNKNOWN", status: cleanInboxText(item?.status, 40).toLowerCase() || "unknown", components: Array.isArray(item?.components) ? item.components : [], rejectionReason: cleanInboxText(item?.rejected_reason, 500) || null, lastSyncedAt: new Date() },
        });
      }
      await prisma.channelConnection.update({ where: { id: connection.id }, data: { lastError: null } });
      return NextResponse.json({ synced: templates.length, notice: `${templates.length} Meta template record${templates.length === 1 ? "" : "s"} synchronized.` });
    }
    if (action === "consent") {
      const contactAddress = cleanContactAddress(body.contactAddress);
      const status = body.status === "opted_out" ? "opted_out" : "opted_in";
      const source = cleanInboxText(body.source, 80);
      const proof = cleanInboxText(body.proof, 500);
      if (contactAddress.length < 7 || !source || status === "opted_in" && !proof) return NextResponse.json({ error: "A valid international number, consent source, and proof for opt-in are required." }, { status: 400 });
      const consent = await prisma.whatsAppConsent.upsert({ where: { workspaceId_contactAddress: { workspaceId: ctx.workspaceId, contactAddress } }, create: { workspaceId: ctx.workspaceId, contactAddress, status, source, proof: proof || null, optedOutAt: status === "opted_out" ? new Date() : null }, update: { status, source, proof: proof || null, capturedAt: status === "opted_in" ? new Date() : undefined, optedOutAt: status === "opted_out" ? new Date() : null } });
      await enqueueWebhookEvent(ctx.workspaceId, "whatsapp.consent_updated", { consentId: consent.id, contactAddress, status, source, sourceType: "workspace" });
      return NextResponse.json({ consent }, { status: 201 });
    }
    if (action === "template") {
      const connection = await prisma.channelConnection.findFirst({ where: { id: String(body.connectionId || ""), workspaceId: ctx.workspaceId, provider: "meta_cloud", status: "active" } });
      if (!connection?.accessTokenEncrypted) return NextResponse.json({ error: "A verified Meta Cloud API connection is required." }, { status: 409 });
      const name = cleanInboxText(body.name, 512).toLowerCase().replace(/[^a-z0-9_]/g, "_"), language = cleanInboxText(body.language, 20) || "en", category = ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(body.category) ? body.category : "UTILITY";
      const text = cleanInboxText(body.text, 4096);
      if (!name || !text) return NextResponse.json({ error: "Template name and body are required." }, { status: 400 });
      const cfg = config(connection.config), meta = await createMetaTemplate(connection.accessTokenEncrypted, String(cfg.wabaId || ""), { name, language, category, components: [{ type: "BODY", text }] });
      const template = await prisma.whatsAppTemplate.create({ data: { workspaceId: ctx.workspaceId, connectionId: connection.id, externalTemplateId: String(meta.id || "") || null, name, language, category, status: "pending", components: [{ type: "BODY", text }], lastSyncedAt: new Date() } });
      return NextResponse.json({ template, notice: "Submitted to Meta. Wazap will not treat it as usable until Meta reports approval." }, { status: 201 });
    }
    if (action === "campaign") {
      const addresses: string[] = Array.from(new Set<string>((Array.isArray(body.audience) ? body.audience : String(body.audience || "").split(/[\s,;]+/)).map((v: unknown) => cleanContactAddress(v)).filter((v: string) => v.length >= 7))).slice(0, 10000);
      const connection = await prisma.channelConnection.findFirst({ where: { id: String(body.connectionId || ""), workspaceId: ctx.workspaceId, provider: "meta_cloud", status: "active" } });
      const template = await prisma.whatsAppTemplate.findFirst({ where: { id: String(body.templateId || ""), workspaceId: ctx.workspaceId, connectionId: connection?.id || "", status: "approved" } });
      if (!connection || !template || !addresses.length) return NextResponse.json({ error: "A verified connection, Meta-approved template, and audience are required." }, { status: 409 });
      const eligible = await prisma.whatsAppConsent.count({ where: { workspaceId: ctx.workspaceId, contactAddress: { in: addresses }, status: "opted_in", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      const campaign = await prisma.whatsAppCampaign.create({ data: { workspaceId: ctx.workspaceId, connectionId: connection.id, templateId: template.id, createdByMemberId: ctx.memberId, name: cleanInboxText(body.name, 120) || "Untitled campaign", audience: addresses, audienceCount: addresses.length, eligibleCount: eligible, status: "draft" } });
      await enqueueWebhookEvent(ctx.workspaceId, "whatsapp.campaign_created", { campaignId: campaign.id, connectionId: connection.id, templateId: template.id, audienceCount: addresses.length, eligibleCount: eligible, source: "workspace" });
      return NextResponse.json({ campaign, excluded: addresses.length - eligible, notice: "Draft created. Unconsented and opted-out recipients are excluded. Sending requires a separate reviewed launch." }, { status: 201 });
    }
    if (action === "schedule_campaign") {
      const campaign = await prisma.whatsAppCampaign.findFirst({ where: { id: String(body.campaignId || ""), workspaceId: ctx.workspaceId, status: "draft" }, include: { connection: true, template: true } });
      if (!campaign) return NextResponse.json({ error: "Only a draft campaign can be reviewed and scheduled." }, { status: 409 });
      if (campaign.connection.provider !== "meta_cloud" || campaign.connection.status !== "active" || !campaign.connection.accessTokenEncrypted || campaign.template.status !== "approved") return NextResponse.json({ error: "An active Meta connection and currently approved template are required." }, { status: 409 });
      const requested = body.scheduledFor ? new Date(String(body.scheduledFor)) : new Date();
      if (Number.isNaN(requested.getTime()) || requested.getTime() > Date.now() + 90 * 86_400_000) return NextResponse.json({ error: "Choose a valid send time within the next 90 days." }, { status: 400 });
      const scheduledFor = requested.getTime() < Date.now() ? new Date() : requested;
      const audience = Array.isArray(campaign.audience) ? campaign.audience.map((value) => cleanContactAddress(value)).filter((value) => value.length >= 7) : [];
      if (!audience.length) return NextResponse.json({ error: "The campaign audience is empty." }, { status: 409 });
      const consents = await prisma.whatsAppConsent.findMany({ where: { workspaceId: ctx.workspaceId, contactAddress: { in: audience } } });
      const consentByAddress = new Map(consents.map((item) => [item.contactAddress, item]));
      const now = new Date();
      const recipients = audience.map((contactAddress) => {
        const consent = consentByAddress.get(contactAddress);
        const eligible = Boolean(consent && consent.status === "opted_in" && (!consent.expiresAt || consent.expiresAt > now));
        return { workspaceId: ctx.workspaceId, campaignId: campaign.id, contactAddress, status: eligible ? "queued" : "excluded", exclusionReason: eligible ? null : "Consent missing, expired, or withdrawn during review." };
      });
      const eligibleCount = recipients.filter((item) => item.status === "queued").length;
      if (!eligibleCount) return NextResponse.json({ error: "No recipients have current opt-in consent. Nothing was scheduled." }, { status: 409 });
      await prisma.$transaction(async (tx) => {
        await tx.whatsAppCampaignRecipient.deleteMany({ where: { campaignId: campaign.id } });
        await tx.whatsAppCampaignRecipient.createMany({ data: recipients });
        await tx.whatsAppCampaign.update({ where: { id: campaign.id }, data: { status: "scheduled", scheduledFor, audienceCount: recipients.length, eligibleCount, optOutCount: recipients.length - eligibleCount, lastError: null } });
      });
      await enqueueWebhookEvent(ctx.workspaceId, "whatsapp.campaign_scheduled", { campaignId: campaign.id, scheduledFor, audienceCount: recipients.length, eligibleCount, excluded: recipients.length - eligibleCount, source: "workspace" });
      return NextResponse.json({ scheduled: true, scheduledFor, audienceCount: recipients.length, eligibleCount, excluded: recipients.length - eligibleCount, notice: `Campaign reviewed and scheduled for ${eligibleCount} consent-eligible recipient${eligibleCount === 1 ? "" : "s"}.` });
    }
    if (action === "cancel_campaign") {
      const campaign = await prisma.whatsAppCampaign.findFirst({ where: { id: String(body.campaignId || ""), workspaceId: ctx.workspaceId, status: { in: ["scheduled", "paused"] } } });
      if (!campaign) return NextResponse.json({ error: "Only a scheduled or paused campaign can be cancelled." }, { status: 409 });
      await prisma.$transaction([
        prisma.whatsAppCampaignRecipient.updateMany({ where: { campaignId: campaign.id, status: "queued" }, data: { status: "cancelled", lastError: "Cancelled by workspace administrator." } }),
        prisma.whatsAppCampaign.update({ where: { id: campaign.id }, data: { status: "cancelled", completedAt: new Date(), lastError: "Cancelled by workspace administrator." } }),
      ]);
      await enqueueWebhookEvent(ctx.workspaceId, "whatsapp.campaign_cancelled", { campaignId: campaign.id, source: "workspace" });
      return NextResponse.json({ cancelled: true, notice: "Campaign cancelled. Previously accepted messages cannot be recalled." });
    }
    if (action === "migration") {
      const parsed = migrationRows(body.rows);
      if (!parsed.received) return NextResponse.json({ error: "Add at least one contact row to validate." }, { status: 400 });
      const existing = await prisma.lead.findMany({ where: { workspaceId: ctx.workspaceId, archivedAt: null }, select: { phone: true } });
      const existingPhones = new Set(existing.map((lead) => cleanContactAddress(lead.phone)));
      const existingLeads = parsed.normalized.filter((row) => existingPhones.has(row.phone)).length;
      const summary = {
        received: parsed.received, valid: parsed.normalized.length, duplicateRows: parsed.duplicateRows,
        rejected: parsed.rejected, existingLeads, importable: parsed.normalized.length - existingLeads,
        imported: 0, consentImported: 0, messagesImported: 0, templatesImported: 0,
        fingerprint: parsed.fingerprint, truncated: parsed.truncated,
      };
      const migration = await prisma.$transaction(async (tx) => {
        const created = await tx.whatsAppMigration.create({ data: { workspaceId: ctx.workspaceId, createdByMemberId: ctx.memberId, sourceProvider: cleanInboxText(body.sourceProvider, 80) || "other", mode: "dry_run", status: "validated", summary } });
        await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "whatsapp_migration_validated", actorUserId: ctx.userId, metadata: { migrationId: created.id, received: summary.received, importable: summary.importable, rejected: summary.rejected, duplicateRows: summary.duplicateRows, existingLeads: summary.existingLeads } } });
        return created;
      });
      return NextResponse.json({ migration, notice: "Preview complete. No contacts, consent, templates or messages were imported." }, { status: 201 });
    }
    if (action === "commit_migration") {
      const migrationId = cleanInboxText(body.migrationId, 120);
      const migration = await prisma.whatsAppMigration.findFirst({ where: { id: migrationId, workspaceId: ctx.workspaceId } });
      if (!migration) return NextResponse.json({ error: "Migration preview not found in this workspace." }, { status: 404 });
      if (migration.status === "completed") return NextResponse.json({ migration, alreadyCompleted: true, notice: "This migration was already completed. No duplicate contacts were created." });
      if (migration.status !== "validated" || migration.mode !== "dry_run") return NextResponse.json({ error: "Only a validated migration preview can be imported." }, { status: 409 });
      const parsed = migrationRows(body.rows);
      const preview = config(migration.summary);
      if (!parsed.received || parsed.fingerprint !== preview.fingerprint) return NextResponse.json({ error: "The contact rows changed after preview. Validate the current file again before importing." }, { status: 409 });
      const result = await prisma.$transaction(async (tx) => {
        const reserved = await tx.whatsAppMigration.updateMany({ where: { id: migration.id, workspaceId: ctx.workspaceId, status: "validated", mode: "dry_run" }, data: { status: "importing" } });
        if (reserved.count !== 1) throw new Error("MIGRATION_ALREADY_RESERVED");
        const current = await tx.lead.findMany({ where: { workspaceId: ctx.workspaceId, archivedAt: null }, select: { phone: true } });
        const existingPhones = new Set(current.map((lead) => cleanContactAddress(lead.phone)));
        const importable = parsed.normalized.filter((row) => !existingPhones.has(row.phone));
        const limit = leadLimit(ctx.plan);
        if (limit !== -1 && current.length + importable.length > limit) throw new Error(`PLAN_LIMIT:${limit}:${current.length}:${importable.length}`);
        const leads = importable.map((row) => ({ id: randomUUID(), userId: ctx.userId, workspaceId: ctx.workspaceId, name: row.name, phone: row.phone, email: row.email, source: `Migration: ${migration.sourceProvider}` }));
        if (leads.length) {
          await tx.lead.createMany({ data: leads });
          await tx.leadActivity.createMany({ data: leads.map((lead) => ({ leadId: lead.id, type: "created", body: `Imported from ${migration.sourceProvider} migration`, metadata: { migrationId: migration.id } })) });
        }
        const finalSummary = {
          ...preview, received: parsed.received, valid: parsed.normalized.length, duplicateRows: parsed.duplicateRows,
          rejected: parsed.rejected, existingLeads: parsed.normalized.length - importable.length,
          importable: importable.length, imported: leads.length, consentImported: 0, messagesImported: 0, templatesImported: 0,
        };
        const completed = await tx.whatsAppMigration.update({ where: { id: migration.id }, data: { mode: "import", status: "completed", summary: finalSummary as Prisma.InputJsonValue, completedAt: new Date(), lastError: null } });
        await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "whatsapp_migration_completed", actorUserId: ctx.userId, metadata: { migrationId: migration.id, sourceProvider: migration.sourceProvider, imported: leads.length, skippedExisting: finalSummary.existingLeads, consentImported: 0, messagesImported: 0 } } });
        return { completed, imported: leads.length, skippedExisting: finalSummary.existingLeads };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
      await enqueueWebhookEvent(ctx.workspaceId, "whatsapp.migration_completed", { migrationId: migration.id, sourceProvider: migration.sourceProvider, imported: result.imported, skippedExisting: result.skippedExisting, consentImported: 0, messagesImported: 0, source: "workspace" });
      return NextResponse.json({ migration: result.completed, imported: result.imported, skippedExisting: result.skippedExisting, notice: `${result.imported} CRM contact${result.imported === 1 ? "" : "s"} imported. Consent and message history were not imported.` });
    }
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    console.error("[meta-platform]", { action, message: error instanceof Error ? error.message : String(error) });
    if (error instanceof Error && error.message === "MIGRATION_ALREADY_RESERVED") return NextResponse.json({ error: "This migration is already being imported or was completed. Refresh before retrying." }, { status: 409 });
    if (error instanceof Error && error.message.startsWith("PLAN_LIMIT:")) {
      const [, limit, current, requested] = error.message.split(":");
      return NextResponse.json({ error: `This import would exceed the plan limit of ${limit} active leads (${current} current + ${requested} new). Upgrade or reduce the file.`, upgrade: true }, { status: 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Meta platform request failed." }, { status: 502 });
  }
}
