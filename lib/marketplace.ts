import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspaces";
import { effectivePlan } from "@/lib/entitlements";

export const MARKETPLACE_SCOPES = [
  "agent:create",
  "knowledge:read",
  "inbox:read",
  "leads:read",
  "products:read",
  "orders:read",
  "webhooks:send",
] as const;
export const MARKETPLACE_PACKAGE_TYPES = [
  "agent",
  "external_tool",
] as const;
export const MARKETPLACE_INSTALL_LIMITS: Record<string, number> = {
  free: 1,
  basic: 3,
  pro: 10,
  ultimate: 30,
  business: 100,
};

export function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}
export function cleanSlug(value: unknown) {
  return cleanText(value, 70)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export function cleanScopes(value: unknown) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .map(String)
            .filter((scope) =>
              MARKETPLACE_SCOPES.includes(
                scope as (typeof MARKETPLACE_SCOPES)[number],
              ),
            ),
        ),
      ]
    : [];
}

export function safeExternalUrl(value: unknown) {
  const raw = cleanText(value, 300);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
    if (
      ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname) ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isValidMarketplaceVersion(value: unknown) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(cleanText(value, 30));
}

export function marketplaceMutationAllowed(req: Request) {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (site && !["same-origin", "same-site", "none"].includes(site)) return false;
  if (!origin) return true;
  try {
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
    const requestHostname = forwardedHost.split(",", 1)[0].trim().replace(/:\d+$/, "");
    return new URL(origin).hostname === requestHostname;
  } catch {
    return false;
  }
}

export async function marketplaceContext() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  const membership = await getActiveWorkspace(userId);
  // A plan-paused member loses access without being removed (billing spec 12g).
  if (membership.planPausedAt) return null;
  const owner = await prisma.user.findUnique({
    where: { id: membership.workspace.ownerId },
    select: { plan: true, trialPlan: true, trialEndsAt: true },
  });
  return {
    userId,
    memberId: membership.id,
    role: membership.role,
    workspaceId: membership.workspaceId,
    plan: effectivePlan(owner),
    isAdmin: Boolean((session?.user as { isAdmin?: boolean })?.isAdmin),
  };
}
