import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";

export async function currentInboxContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as { id: string }).id;
  const membership = await getActiveWorkspace(userId);
  // A plan-paused member loses access to workspace features without being
  // removed (billing spec 12g). This is the shared gate behind automations,
  // AI agents/knowledge, channels, API keys, and webhooks.
  if (membership.planPausedAt) return null;
  return { userId, workspaceId: membership.workspaceId, memberId: membership.id, role: membership.role };
}

export function cleanInboxText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export function cleanContactAddress(value: unknown, channel = "whatsapp") {
  const raw = String(value ?? "").trim();
  return channel === "whatsapp" || channel === "sms" ? raw.replace(/\D/g, "").slice(0, 20) : raw.toLowerCase().slice(0, 200);
}

export async function accessibleConversation(workspaceId: string, id: string) {
  return prisma.inboxConversation.findFirst({ where: { id, workspaceId } });
}

export async function validWorkspaceMember(workspaceId: string, memberId: unknown) {
  if (!memberId) return null;
  return prisma.workspaceMember.findFirst({ where: { id: String(memberId), workspaceId } });
}
