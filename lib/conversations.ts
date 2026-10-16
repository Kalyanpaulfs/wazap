import { prisma } from "@/lib/prisma";
import { ensurePersonalWorkspace } from "@/lib/workspaces";

type ConversationStartInput = {
  userId: string;
  assetType: "short_link" | "rotator" | "ad_link" | "widget" | "qr" | "direct";
  assetId?: string | null;
  assetName?: string | null;
  source?: string | null;
  campaign?: string | null;
  destination?: string | null;
};

function clean(value: string | null | undefined, max: number) {
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
      },
    });
  } catch (error) {
    console.error("[conversation-start] measurement failed", input.assetType, error);
  }
}
