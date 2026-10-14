// Replicates the post-transaction wiring that app/api/payment/{paypal,dodo}/
// webhook/route.ts does around lib/payment-integrity.ts's three functions,
// without going through the HTTP route (no signature verification, no
// provider subscription lookups, no funnel/partner side effects - those are
// not part of the billing state machine). Mirrors runPostTransactionActions
// and the `cancelOld` derivation for a scheduled (downgrade) activation,
// lines app/api/payment/paypal/webhook/route.ts:117-141,245-260 and the
// identical block in app/api/payment/dodo/webhook/route.ts.
import { completeOldSubscriptionCancel, cancelProviderSubscription, refundPayment } from "@/lib/billing-actions";
import type { DuplicateSubscriptionInfo } from "@/lib/payment-integrity";

export async function runPostTransactionActions(opts: {
  cancelOld?: { provider: string; subscriptionId: string; planChangeId?: string | null } | null;
  duplicateSubscription?: DuplicateSubscriptionInfo | null;
  userId: string;
}) {
  if (opts.cancelOld) {
    await completeOldSubscriptionCancel({
      id: opts.cancelOld.planChangeId ?? null,
      userId: opts.userId,
      provider: opts.cancelOld.provider,
      oldSubscriptionId: opts.cancelOld.subscriptionId,
    });
  }
  if (opts.duplicateSubscription) {
    if (opts.duplicateSubscription.paymentId) {
      await refundPayment({
        paymentId: opts.duplicateSubscription.paymentId,
        kind: "duplicate",
        actorUserId: null,
        reason: "Automatic duplicate subscription refund",
        now: new Date(),
        subscriptionId: opts.duplicateSubscription.subscriptionId,
      });
    } else {
      await cancelProviderSubscription(
        opts.duplicateSubscription.provider as "paypal" | "dodo",
        opts.duplicateSubscription.subscriptionId,
        "duplicate_subscription",
      );
    }
  }
}

// Mirrors the `cancelOld` derivation the webhook routes compute from
// applyVerifiedLifecycle's result (only a *downgrade* cancels the old
// subscription here; Dodo's in-place change never has oldSubscriptionId !==
// newSubscriptionId; a renew's old subscription was already cancelled when
// auto-pay was turned off).
export function cancelOldForScheduledActivation(scheduledActivated: {
  kind: string;
  provider: string;
  oldSubscriptionId: string | null;
  newSubscriptionId: string | null;
  id: string;
} | null | undefined) {
  if (
    scheduledActivated?.kind === "downgrade" &&
    scheduledActivated.oldSubscriptionId &&
    scheduledActivated.oldSubscriptionId !== scheduledActivated.newSubscriptionId
  ) {
    return { provider: scheduledActivated.provider, subscriptionId: scheduledActivated.oldSubscriptionId, planChangeId: scheduledActivated.id };
  }
  return null;
}
