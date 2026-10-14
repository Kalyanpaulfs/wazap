import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/developer-platform";

export const CHANNEL_TYPES = ["whatsapp", "instagram", "messenger", "email", "sms", "rcs", "telegram"] as const;
export const CHANNEL_LIMITS: Record<string, number> = { free: 1, basic: 1, pro: 3, ultimate: 10, business: 25 };
export const CHANNEL_LABELS: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", email: "Email", sms: "SMS", rcs: "RCS", telegram: "Telegram" };
const baseUrl = () => process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt";

export function channelEndpoints(pathToken: string) {
  return {
    inbound: `${baseUrl()}/api/channels/inbound/${pathToken}`,
    outbound: `${baseUrl()}/api/channels/outbound/${pathToken}`,
  };
}

export function publicChannel(connection: {
  id: string; channel: string; provider: string; displayName: string;
  externalAccountId: string | null; status: string; capabilities: string[];
  secretPrefix: string; webhookPathToken: string; lastVerifiedAt: Date | null;
  lastEventAt: Date | null; lastError: string | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: connection.id,
    channel: connection.channel,
    provider: connection.provider,
    displayName: connection.displayName,
    externalAccountId: connection.externalAccountId,
    status: connection.status,
    capabilities: connection.capabilities,
    secretPrefix: connection.secretPrefix,
    endpoints: channelEndpoints(connection.webhookPathToken),
    lastVerifiedAt: connection.lastVerifiedAt,
    lastEventAt: connection.lastEventAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export function createChannelCredential() {
  const secret = `wzch_${randomBytes(32).toString("base64url")}`;
  return { secret, encrypted: encryptSecret(secret), prefix: secret.slice(0, 13), pathToken: randomBytes(20).toString("base64url") };
}

export function channelSignature(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyChannelSignature(encrypted: string, timestamp: string, rawBody: string, supplied: string) {
  if (!/^\d{10,13}$/.test(timestamp)) return false;
  const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 300_000) return false;
  const expected = Buffer.from(channelSignature(decryptSecret(encrypted), timestamp, rawBody), "hex");
  const value = supplied.startsWith("v1=") ? supplied.slice(3) : supplied;
  if (!/^[a-f0-9]{64}$/i.test(value)) return false;
  const actual = Buffer.from(value, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function channelSummary(workspaceId: string) {
  const [connections, failedEvents] = await Promise.all([
    prisma.channelConnection.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { id: true, channel: true, provider: true, displayName: true, externalAccountId: true, status: true, capabilities: true, secretPrefix: true, webhookPathToken: true, lastVerifiedAt: true, lastEventAt: true, lastError: true, createdAt: true, planPausedAt: true, _count: { select: { conversations: true, events: true } } } }),
    prisma.channelEvent.count({ where: { workspaceId, status: "failed" } }),
  ]);
  return { connections, failedEvents };
}
