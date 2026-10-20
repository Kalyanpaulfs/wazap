import { prisma } from "@/lib/prisma";
import { ensurePersonalWorkspace } from "@/lib/workspaces";

// Audience feature (FEAT-AUDIENCE): device/OS from lib/audience.ts,
// country/city from lib/geo-city.ts - derived labels only, computed by the
// caller before the raw IP/user-agent go out of scope. Never a raw IP or
// user-agent here, see the comment on recordConversationStart below.
export type AudienceFields = {
  device?: string | null;
  os?: string | null;
  country?: string | null;
  city?: string | null;
};

type ConversationStartInput = {
  userId: string;
  assetType: "short_link" | "rotator" | "ad_link" | "widget" | "qr" | "direct";
  assetId?: string | null;
  assetName?: string | null;
  source?: string | null;
  campaign?: string | null;
  destination?: string | null;
  audience?: AudienceFields;
};

export function clean(value: string | null | undefined, max: number) {
  return value?.trim().slice(0, max) || null;
}

/**
 * Records the business outcome Wazap is built around without storing message
 * content, customer phone numbers, IP addresses, or browser fingerprints.
 * Routing must never fail because measurement failed.
 */
export async function recordConversationStart(input: ConversationStartInput) {
  try {
    const membership = await ensurePersonalWorkspace(input.userId);
    await prisma.conversationStart.create({
      data: {
        userId: input.userId,
        workspaceId: membership.workspaceId,
        assetType: input.assetType,
        assetId: clean(input.assetId, 64),
        assetName: clean(input.assetName, 120),
        source: clean(input.source, 100),
        campaign: clean(input.campaign, 120),
        destination: clean(input.destination, 32),
        device: clean(input.audience?.device, 20),
        os: clean(input.audience?.os, 20),
        country: clean(input.audience?.country, 2),
        city: clean(input.audience?.city, 80),
      },
    });
  } catch (error) {
    console.error("[conversation-start] measurement failed", input.assetType, error);
  }
}
