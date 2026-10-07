import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cacheRoute, readCachedRoute } from "@/lib/routing-cache";
import { recordConversationStart } from "@/lib/conversations";
import { routerQuota } from "@/lib/router-entitlements";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();
  let rotator: { id?: string; userId?: string; name?: string; code: string; numbers: string[]; fallbackNumber?: string | null; currentIdx: number } | null = null;
  try {
    rotator = await Promise.race([
      prisma.rotatorLink.findUnique({ where: { code: normalizedCode } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("routing database timeout")), 1200)),
    ]);
    if (rotator) await cacheRoute({ code: rotator.code, numbers: rotator.numbers, fallbackNumber: rotator.fallbackNumber, currentIdx: rotator.currentIdx }).catch(() => {});
  } catch {
    rotator = await readCachedRoute(normalizedCode);
  }
  if (!rotator) redirect("/");

  let quotaBlocked = false;
  if (rotator.id && rotator.userId) {
    try {
      const [owner, routedStarts] = await Promise.all([
        prisma.user.findUnique({
          where: { id: rotator.userId },
          select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
        }),
        prisma.conversationStart.count({ where: { userId: rotator.userId, assetType: "rotator" } }),
      ]);
      const quota = routerQuota(owner, routedStarts);
      quotaBlocked = !quota.allowed;
    } catch {
      // If metering is temporarily unavailable, preserve the public routing link.
    }
  }
  if (quotaBlocked) redirect(`/router-limit?code=${encodeURIComponent(normalizedCode)}`);

  const validNumbers = rotator.numbers.map(number => number.replace(/\D/g, "")).filter(number => number.length >= 8);
  const fallback = (rotator.fallbackNumber || process.env.WAZAP_DEFAULT_WHATSAPP_NUMBER || validNumbers[0] || "").replace(/\D/g, "");
  if (!validNumbers.length && !fallback) redirect("/");

  const idx = validNumbers.length ? rotator.currentIdx % validNumbers.length : 0;
  const number = validNumbers[idx] || fallback;
  const nextIdx = validNumbers.length ? (idx + 1) % validNumbers.length : 0;

  if (rotator.id) await prisma.rotatorLink.update({
    where: { id: rotator.id },
    data: { currentIdx: nextIdx, totalClicks: { increment: 1 } },
  }).catch(() => {});

  if (rotator.userId) await recordConversationStart({
    userId: rotator.userId,
    assetType: "rotator",
    assetId: rotator.id,
    assetName: rotator.name,
    source: "Wazap rotator",
    destination: number || fallback,
  });

  redirect(`https://wa.me/${number || fallback}`);
}
