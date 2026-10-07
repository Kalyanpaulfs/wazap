import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentInboxContext, cleanInboxText } from "@/lib/inbox";
import { CHANNEL_LIMITS, CHANNEL_TYPES, channelSummary, createChannelCredential } from "@/lib/channels";
import { rateLimit } from "@/lib/rate-limit";
import { effectivePlan } from "@/lib/entitlements";
import { enqueueWebhookEvent } from "@/lib/developer-platform";

async function context() {
  const ctx = await currentInboxContext(); if (!ctx) return null;
  const workspace = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, include: { owner: { select: { plan: true, trialPlan: true, trialEndsAt: true } } } });
  return workspace ? { ...ctx, plan: effectivePlan(workspace.owner) } : null;
}
function endpoint(token: string) { return `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt"}/api/channels/inbound/${token}`; }
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function GET() {
  const ctx = await context(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await channelSummary(ctx.workspaceId);
  return NextResponse.json({ ...summary, plan: ctx.plan, limit: CHANNEL_LIMITS[ctx.plan] || 1, supportedChannels: CHANNEL_TYPES, transport: { provider: "custom_bridge", direction: "capability_negotiated", signature: "HMAC-SHA256", timestampToleranceSeconds: 300 }, connections: summary.connections.map(item => ({ ...item, endpoint: endpoint(item.webhookPathToken), outboundEndpoint: `${endpoint(item.webhookPathToken).replace("/inbound/", "/outbound/")}`, webhookPathToken: undefined })) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await context(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Workspace owner or admin access required." }, { status: 403 });
  if (!rateLimit(`channels:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many channel changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "rotate") {
    const existing = await prisma.channelConnection.findFirst({ where: { id: String(body.id || ""), workspaceId: ctx.workspaceId } }); if (!existing) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    const credential = createChannelCredential();
    const connection = await prisma.$transaction(async (tx) => {
      const changed = await tx.channelConnection.update({ where: { id: existing.id }, data: { signingSecretEncrypted: credential.encrypted, secretPrefix: credential.prefix, webhookPathToken: credential.pathToken, status: "pending_verification", lastVerifiedAt: null, lastError: null } });
      await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "channel_credential_rotated", actorUserId: ctx.userId, metadata: { connectionId: changed.id, displayName: changed.displayName, channel: changed.channel, provider: changed.provider } } });
      return changed;
    });
    await enqueueWebhookEvent(ctx.workspaceId, "channel.rotated", { connectionId: connection.id, channel: connection.channel, provider: connection.provider, status: connection.status, source: "workspace" });
    return NextResponse.json({ connection: { id: connection.id, endpoint: endpoint(connection.webhookPathToken), secretPrefix: connection.secretPrefix }, signingSecret: credential.secret, notice: "Copy this signing secret now. Wazap will not show it again." });
  }
  const count = await prisma.channelConnection.count({ where: { workspaceId: ctx.workspaceId, status: { not: "disabled" } } }); const limit = CHANNEL_LIMITS[ctx.plan] || 1;
  if (count >= limit) return NextResponse.json({ error: `Your ${ctx.plan} plan supports ${limit} channel connection${limit === 1 ? "" : "s"}.`, upgrade: true }, { status: 403 });
  const channel = CHANNEL_TYPES.includes(body.channel) ? body.channel : "whatsapp"; const displayName = cleanInboxText(body.displayName, 80); if (!displayName) return NextResponse.json({ error: "Connection name is required." }, { status: 400 });
  const credential = createChannelCredential();
  const connection = await prisma.$transaction(async (tx) => {
    const created = await tx.channelConnection.create({ data: { workspaceId: ctx.workspaceId, createdByMemberId: ctx.memberId, channel, displayName, provider: "custom_bridge", externalAccountId: cleanInboxText(body.externalAccountId, 120) || null, capabilities: ["receive"], signingSecretEncrypted: credential.encrypted, secretPrefix: credential.prefix, webhookPathToken: credential.pathToken, config: { retention: "normalized_only", outbound: false } } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "channel_created", actorUserId: ctx.userId, metadata: { connectionId: created.id, displayName: created.displayName, channel: created.channel, provider: created.provider } } });
    return created;
  });
  await enqueueWebhookEvent(ctx.workspaceId, "channel.created", { connectionId: connection.id, channel: connection.channel, provider: connection.provider, status: connection.status, source: "workspace" });
  return NextResponse.json({ connection: { id: connection.id, channel, displayName, status: connection.status, capabilities: connection.capabilities, endpoint: endpoint(connection.webhookPathToken), outboundEndpoint: endpoint(connection.webhookPathToken).replace("/inbound/", "/outbound/"), secretPrefix: connection.secretPrefix }, signingSecret: credential.secret, notice: "Copy this signing secret now. Send a signed verification event to activate inbound delivery. A bridge can explicitly request send and delivery_receipts capabilities during verification." }, { status: 201 });
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await context(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Workspace owner or admin access required." }, { status: 403 });
  if (!rateLimit(`channels:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many channel changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({})); const existing = await prisma.channelConnection.findFirst({ where: { id: String(body.id || ""), workspaceId: ctx.workspaceId } }); if (!existing) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  const requested = String(body.status || ""); const status = requested === "paused" && existing.status === "active" ? "paused" : requested === "active" && existing.status === "paused" ? "active" : null; if (!status) return NextResponse.json({ error: "Only verified connections can be paused or resumed." }, { status: 409 });
  const connection = await prisma.$transaction(async (tx) => {
    const changed = await tx.channelConnection.update({ where: { id: existing.id }, data: { status } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: status === "paused" ? "channel_paused" : "channel_resumed", actorUserId: ctx.userId, metadata: { connectionId: changed.id, displayName: changed.displayName, channel: changed.channel, provider: changed.provider } } });
    return changed;
  });
  await enqueueWebhookEvent(ctx.workspaceId, status === "paused" ? "channel.paused" : "channel.resumed", { connectionId: connection.id, channel: connection.channel, provider: connection.provider, status, source: "workspace" });
  return NextResponse.json({ connection });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await context(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Workspace owner or admin access required." }, { status: 403 });
  if (!rateLimit(`channels:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many channel changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({})); const existing = await prisma.channelConnection.findFirst({ where: { id: String(body.id || ""), workspaceId: ctx.workspaceId }, select: { id: true, displayName: true, channel: true, provider: true } }); if (!existing) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.channelConnection.update({ where: { id: existing.id }, data: { status: "disabled", lastError: "Disabled by workspace administrator." } }),
    prisma.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "channel_disabled", actorUserId: ctx.userId, metadata: { connectionId: existing.id, displayName: existing.displayName, channel: existing.channel, provider: existing.provider } } }),
  ]);
  await enqueueWebhookEvent(ctx.workspaceId, "channel.disabled", { connectionId: existing.id, channel: existing.channel, provider: existing.provider, source: "workspace" });
  return NextResponse.json({ success: true, retainedHistory: true });
}
