import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentAiContext } from "@/lib/ai-agents";
import { API_KEY_LIMITS, API_SCOPES, createApiCredential, hashSecret } from "@/lib/developer-platform";
import { cleanInboxText } from "@/lib/inbox";
import { rateLimit } from "@/lib/rate-limit";

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function GET() {
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [keys, requestLogs] = await Promise.all([prisma.apiKey.findMany({ where: { workspaceId: ctx.workspaceId }, select: { id: true, name: true, prefix: true, scopes: true, status: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } }), prisma.apiRequestLog.findMany({ where: { workspaceId: ctx.workspaceId }, select: { requestId: true, method: true, path: true, statusCode: true, latencyMs: true, errorCode: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 25 })]);
  return NextResponse.json({ keys, requestLogs, availableScopes: API_SCOPES, limit: API_KEY_LIMITS[ctx.plan] ?? 0, plan: ctx.plan });
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Only workspace owners and admins can create API keys." }, { status: 403 });
  if (!rateLimit(`developer-keys:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many API key changes. Please wait." }, { status: 429 });
  const limit = API_KEY_LIMITS[ctx.plan] ?? 0; const count = await prisma.apiKey.count({ where: { workspaceId: ctx.workspaceId, status: "active" } });
  if (count >= limit) return NextResponse.json({ error: limit ? `Your ${ctx.plan} plan supports ${limit} active API key${limit === 1 ? "" : "s"}.` : "API access is available on Solo and higher plans.", upgrade: true }, { status: 403 });
  const body = await req.json().catch(() => ({})); const name = cleanInboxText(body.name, 80); const scopes: string[] = Array.isArray(body.scopes) ? [...new Set<string>(body.scopes.map(String).filter((scope: string) => API_SCOPES.includes(scope as typeof API_SCOPES[number])))] : [];
  if (!name || !scopes.length) return NextResponse.json({ error: "Key name and at least one valid scope are required." }, { status: 400 });
  const days = Math.max(1, Math.min(Number(body.expiresInDays) || 90, 365)); const credential = createApiCredential();
  const expiresAt = new Date(Date.now() + days * 86400000);
  const key = await prisma.$transaction(async (tx) => {
    const created = await tx.apiKey.create({ data: { workspaceId: ctx.workspaceId, createdByMemberId: ctx.memberId, name, prefix: credential.prefix, keyHash: hashSecret(credential.key), scopes, expiresAt }, select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, createdAt: true } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "api_key_created", actorUserId: ctx.userId, metadata: { keyId: created.id, name: created.name, prefix: created.prefix, scopes: created.scopes, expiresAt: created.expiresAt } } });
    return created;
  });
  return NextResponse.json({ key, secret: credential.key, notice: "Copy this key now. Wazap stores only its hash and cannot show it again." }, { status: 201 });
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rateLimit(`developer-keys:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many API key changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const existing = await prisma.apiKey.findFirst({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId, status: "active" }, select: { id: true, name: true, prefix: true } });
  if (!existing) return NextResponse.json({ error: "Active API key not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.apiKey.update({ where: { id: existing.id }, data: { status: "revoked", revokedAt: new Date() } }),
    prisma.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "api_key_revoked", actorUserId: ctx.userId, metadata: { keyId: existing.id, name: existing.name, prefix: existing.prefix } } }),
  ]);
  return NextResponse.json({ success: true });
}
