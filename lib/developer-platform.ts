import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { webhookUrl, publicWebhookAddresses } from "./safe-webhook-request";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import type { Prisma } from "@prisma/client";

export const API_SCOPES = ["conversations:read", "conversations:write", "messages:write", "leads:read", "leads:write", "tasks:read", "tasks:write", "automations:read", "automations:write", "agents:read", "agents:write", "channels:read", "channels:write", "whatsapp:read", "whatsapp:write", "analytics:read", "operations:read", "partners:read", "audit:read"] as const;
export const WEBHOOK_EVENTS = ["conversation.created", "conversation.updated", "message.recorded", "message.accepted", "message.delivered", "message.read", "message.failed", "channel.created", "channel.rotated", "channel.paused", "channel.resumed", "channel.disabled", "channel.verified", "channel.message_received", "lead.created", "lead.updated", "task.created", "task.updated", "task.archived", "automation.created", "automation.updated", "automation.archived", "agent.created", "agent.updated", "agent.archived", "whatsapp.consent_updated", "whatsapp.campaign_created", "whatsapp.campaign_scheduled", "whatsapp.campaign_cancelled", "whatsapp.migration_completed", "partner.trial_attributed", "partner.customer_converted", "handoff.created", "marketplace.installed", "marketplace.uninstalled", "marketplace.agent_activated", "marketplace.package_suspended", "marketplace.package_removed", "marketplace.package_rolled_back"] as const;
export const API_KEY_LIMITS: Record<string, number> = { free: 0, basic: 1, pro: 3, ultimate: 10, business: 25 };
export const WEBHOOK_LIMITS: Record<string, number> = { free: 0, basic: 1, pro: 3, ultimate: 10, business: 25 };

export function hashSecret(value: string) { return createHash("sha256").update(value).digest("hex"); }
function encryptionKey() {
  const source = process.env.WEBHOOK_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!source) throw new Error("Webhook encryption is not configured");
  return createHash("sha256").update(source).digest();
}
export function encryptSecret(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv); const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptSecret(value: string) {
  const [iv, tag, data] = value.split("."); const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
export function createApiCredential() { const prefix = randomBytes(5).toString("hex"); const key = `wz_live_${prefix}_${randomBytes(24).toString("base64url")}`; return { key, prefix: `wz_live_${prefix}` }; }
export function createWebhookSecret() { return `whsec_${randomBytes(32).toString("base64url")}`; }

export async function validateWebhookUrl(input: string, resolveDns = false) {
  const url = webhookUrl(input);
  if (resolveDns) await publicWebhookAddresses(url);
  return url;
}

export type ApiContext = { apiKeyId: string; workspaceId: string; createdByMemberId: string | null; scopes: string[]; requestId: string; startedAt: number };
export type ApiMutationStart =
  | { state: "reserved"; keyHash: string }
  | { state: "replay"; statusCode: number; response: Record<string, unknown> }
  | { state: "error"; status: number; code: string; message: string };

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

export function apiRequestHash(value: unknown) { return hashSecret(stableJson(value)); }
export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 60 * 60_000, 12 * 60 * 60_000, 24 * 60 * 60_000] as const;
export function webhookRetryAt(attemptsCompleted: number, now = Date.now()) {
  const index = Math.max(0, Math.min(attemptsCompleted - 1, WEBHOOK_RETRY_DELAYS_MS.length - 1));
  return new Date(now + WEBHOOK_RETRY_DELAYS_MS[index]);
}

export async function beginApiMutation(req: Request, ctx: ApiContext, body: unknown): Promise<ApiMutationStart> {
  const idempotencyKey = String(req.headers.get("idempotency-key") || "").trim().slice(0, 200);
  if (idempotencyKey.length < 8) return { state: "error", status: 400, code: "idempotency_key_required", message: "Provide a stable Idempotency-Key header of at least 8 characters." };
  const path = new URL(req.url).pathname.slice(0, 200);
  const keyHash = hashSecret(`${ctx.workspaceId}:${req.method}:${path}:${idempotencyKey}`);
  const requestHash = hashSecret(stableJson(body));
  try {
    await prisma.apiIdempotencyRecord.create({ data: {
      workspaceId: ctx.workspaceId,
      apiKeyId: ctx.apiKeyId,
      keyHash,
      requestHash,
      method: req.method,
      path,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    } });
    return { state: "reserved", keyHash };
  } catch {
    const existing = await prisma.apiIdempotencyRecord.findUnique({ where: { keyHash } });
    if (!existing) return { state: "error", status: 503, code: "idempotency_unavailable", message: "Retry safety is temporarily unavailable." };
    if (existing.requestHash !== requestHash) return { state: "error", status: 409, code: "idempotency_conflict", message: "This Idempotency-Key was already used with a different request body." };
    if (existing.expiresAt <= new Date()) {
      await prisma.apiIdempotencyRecord.deleteMany({ where: { id: existing.id, expiresAt: { lte: new Date() } } });
      return beginApiMutation(req, ctx, body);
    }
    if (existing.statusCode === null || !existing.response || typeof existing.response !== "object" || Array.isArray(existing.response)) {
      return { state: "error", status: 409, code: "request_in_progress", message: "A request with this Idempotency-Key is still in progress. Retry shortly." };
    }
    return { state: "replay", statusCode: existing.statusCode, response: existing.response as Record<string, unknown> };
  }
}

export async function finishApiMutation(keyHash: string, statusCode: number, response: Record<string, unknown>) {
  await prisma.apiIdempotencyRecord.update({ where: { keyHash }, data: { statusCode, response: JSON.parse(JSON.stringify(response)) } });
}

export function replayApiMutation(start: Extract<ApiMutationStart, { state: "replay" }>, requestId: string) {
  const meta = start.response.meta && typeof start.response.meta === "object" && !Array.isArray(start.response.meta)
    ? start.response.meta as Record<string, unknown>
    : {};
  return { ...start.response, meta: { ...meta, requestId, replayed: true } };
}

export async function abandonApiMutation(keyHash: string) {
  await prisma.apiIdempotencyRecord.deleteMany({ where: { keyHash, statusCode: null } });
}

export async function authenticateApi(req: Request, requiredScope: string): Promise<{ context?: ApiContext; error?: { status: number; code: string; message: string } }> {
  const auth = req.headers.get("authorization") || ""; const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("wz_live_")) return { error: { status: 401, code: "invalid_api_key", message: "Provide a valid Wazap bearer token." } };
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashSecret(token) } });
  if (!key || key.status !== "active" || key.expiresAt && key.expiresAt <= new Date()) return { error: { status: 401, code: "invalid_api_key", message: "API key is invalid, revoked, or expired." } };
  if (!key.scopes.includes(requiredScope)) return { error: { status: 403, code: "insufficient_scope", message: `This key requires ${requiredScope}.` } };
  if (!await sharedRateLimit(`public-api:${key.id}`, 120, 60_000)) return { error: { status: 429, code: "rate_limited", message: "API rate limit exceeded." } };
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { context: { apiKeyId: key.id, workspaceId: key.workspaceId, createdByMemberId: key.createdByMemberId, scopes: key.scopes, requestId: randomUUID(), startedAt: Date.now() } };
}
export async function logApiRequest(ctx: ApiContext, req: Request, statusCode: number, errorCode?: string) {
  await prisma.apiRequestLog.create({ data: { workspaceId: ctx.workspaceId, apiKeyId: ctx.apiKeyId, requestId: ctx.requestId, method: req.method, path: new URL(req.url).pathname.slice(0, 200), statusCode, latencyMs: Math.max(0, Date.now() - ctx.startedAt), errorCode } }).catch(() => {});
}

export async function enqueueWebhookEvent(workspaceId: string, eventType: string, data: Prisma.InputJsonValue) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { workspaceId, status: "active", events: { has: eventType } }, select: { id: true } });
  if (!endpoints.length) return;
  const eventId = `evt_${randomUUID().replaceAll("-", "")}`; const payload = { id: eventId, type: eventType, createdAt: new Date().toISOString(), data };
  await prisma.webhookDelivery.createMany({ data: endpoints.map((endpoint) => ({ endpointId: endpoint.id, eventId, eventType, payload })) });
}
