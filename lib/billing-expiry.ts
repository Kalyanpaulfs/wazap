import { prisma } from "./prisma";
import { isPlanExpired } from "./billing";
import { syncPlanLimits } from "./plan-limit-sync";

// Downgrades an expired plan only if the row still holds the plan and expiry we
// read. A renewal that commits in between changes planExpiresAt, so this never
// overwrites a fresh payment.
export async function downgradeIfExpired(user: { id: string; plan: string; planExpiresAt: Date | null }): Promise<boolean> {
  if (!isPlanExpired(user.plan, user.planExpiresAt)) return false;
  const changed = await prisma.user.updateMany({
    where: { id: user.id, plan: user.plan, planExpiresAt: user.planExpiresAt },
    data: { plan: "free", planExpiresAt: null },
  });
  if (changed.count === 1) {
    try {
      await syncPlanLimits(user.id);
    } catch (err) {
      console.error("[plan-limit-sync] failed after expiry downgrade", user.id, err instanceof Error ? err.message : String(err));
    }
  }
  return changed.count === 1;
}
