import { prisma } from "./prisma";
import { isPlanExpired } from "./billing";

// Downgrades an expired plan only if the row still holds the plan and expiry we
// read. A renewal that commits in between changes planExpiresAt, so this never
// overwrites a fresh payment.
export async function downgradeIfExpired(user: { id: string; plan: string; planExpiresAt: Date | null }): Promise<boolean> {
  if (!isPlanExpired(user.plan, user.planExpiresAt)) return false;
  const changed = await prisma.user.updateMany({
    where: { id: user.id, plan: user.plan, planExpiresAt: user.planExpiresAt },
    data: { plan: "free", planExpiresAt: null },
  });
  return changed.count === 1;
}
