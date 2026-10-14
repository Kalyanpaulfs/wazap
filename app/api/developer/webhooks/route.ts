import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentAiContext } from "@/lib/ai-agents";
import { WEBHOOK_EVENTS, WEBHOOK_LIMITS, createWebhookSecret, encryptSecret, validateWebhookUrl } from "@/lib/developer-platform";
import { cleanInboxText } from "@/lib/inbox";
import { rateLimit } from "@/lib/rate-limit";

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function GET() {
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { workspaceId: ctx.workspaceId }, select: { id: true, url: true, description: true, secretPrefix: true, events: true, status: true, failureCount: true, lastDeliveredAt: true, disabledAt: true, createdAt: true, planPausedAt: true, deliveries: { select: { id: true, eventId: true, eventType: true, status: true, attempts: true, responseStatus: true, lastError: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ endpoints, availableEvents: WEBHOOK_EVENTS, limit: WEBHOOK_LIMITS[ctx.plan] ?? 0, plan: ctx.plan });
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Only owners and admins can configure webhooks." }, { status: 403 });
  if (!rateLimit(`developer-webhooks:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many webhook changes. Please wait." }, { status: 429 });
  const limit = WEBHOOK_LIMITS[ctx.plan] ?? 0; const count = await prisma.webhookEndpoint.count({ where: { workspaceId: ctx.workspaceId, status: "active", planPausedAt: null } });
  if (count >= limit) return NextResponse.json({ error: limit ? `Your ${ctx.plan} plan supports ${limit} active webhook endpoint${limit === 1 ? "" : "s"}.` : "Webhooks are available on Solo and higher plans.", upgrade: true }, { status: 403 });
  const body = await req.json().catch(() => ({})); const url = await validateWebhookUrl(cleanInboxText(body.url, 500)).catch((error: Error) => error); if (url instanceof Error) return NextResponse.json({ error: url.message }, { status: 400 });
  const events: string[] = Array.isArray(body.events) ? [...new Set<string>(body.events.map(String).filter((event: string) => WEBHOOK_EVENTS.includes(event as typeof WEBHOOK_EVENTS[number])))] : [];
  if (!events.length) return NextResponse.json({ error: "Select at least one supported event." }, { status: 400 });
  const secret = createWebhookSecret();
  const endpoint = await prisma.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({ data: { workspaceId: ctx.workspaceId, createdByMemberId: ctx.memberId, url: url.toString(), description: cleanInboxText(body.description, 160) || null, secretEncrypted: encryptSecret(secret), secretPrefix: secret.slice(0, 12), events }, select: { id: true, url: true, events: true, status: true, secretPrefix: true, createdAt: true } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "webhook_created", actorUserId: ctx.userId, metadata: { endpointId: created.id, events: created.events } } });
    return created;
  });
  return NextResponse.json({ endpoint, secret, notice: "Copy this signing secret now. It is encrypted at rest and is not shown again." }, { status: 201 });
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rateLimit(`developer-webhooks:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many webhook changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const existing = await prisma.webhookEndpoint.findFirst({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId, status: { in: ["active", "paused"] } }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Active endpoint not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.webhookEndpoint.update({ where: { id: existing.id }, data: { status: "disabled", disabledAt: new Date(), planPausedAt: null, planPausedFromStatus: null } }),
    prisma.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "webhook_disabled", actorUserId: ctx.userId, metadata: { endpointId: existing.id } } }),
  ]);
  return NextResponse.json({ success: true });
}
