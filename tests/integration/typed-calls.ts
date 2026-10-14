// lib/payment-integrity.ts's three functions each return a value built from
// several different `return` statements inside a prisma.$transaction
// callback with no explicit return-type annotation. TypeScript infers that
// as a union, but widens the `duplicate`/`stale` discriminant fields to
// `boolean` in the process (not the literal `true`/`false`) - so
// `Extract<InferredType, { duplicate: false }>` resolves to `never` and
// `.cancelOld` etc. don't type-check at call sites. These wrappers are the
// single place that re-asserts the real shape (matching the source read
// during review) as an explicit, literal-preserving type, so
// helpers.ts's assertNotDuplicate/assertLifecycleApplied can narrow normally
// everywhere else.
import { recordVerifiedCharge, applyVerifiedLifecycle, type DuplicateSubscriptionInfo } from "@/lib/payment-integrity";

export type ChargeResult =
  | { duplicate: true; duplicateSubscription?: DuplicateSubscriptionInfo }
  | {
      duplicate: false;
      cancelOld: { provider: string; subscriptionId: string; planChangeId: string } | null;
      duplicateSubscription: DuplicateSubscriptionInfo | null;
      classification: "same" | "expected_change" | "duplicate" | "first";
    };

export type ScheduledActivation = {
  id: string;
  kind: string;
  provider: string;
  oldSubscriptionId: string | null;
  newSubscriptionId: string | null;
} | null;

export type LifecycleResult =
  | { duplicate: true; stale: false }
  | { duplicate: false; stale: true }
  | { duplicate: false; stale: false; scheduledActivated: ScheduledActivation; duplicateSubscription: DuplicateSubscriptionInfo | null };

export async function chargeOnce(opts: Parameters<typeof recordVerifiedCharge>[0]): Promise<ChargeResult> {
  return (await recordVerifiedCharge(opts)) as unknown as ChargeResult;
}

export async function lifecycleOnce(opts: Parameters<typeof applyVerifiedLifecycle>[0]): Promise<LifecycleResult> {
  return (await applyVerifiedLifecycle(opts)) as unknown as LifecycleResult;
}
