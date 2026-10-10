import { prisma } from './prisma';

/** Subscription records are distinct from receipts: charge IDs cannot cancel renewals. */
export const subscriptionRecordWhere = {
  status: { in: ['active', 'subscription_active'] },
  txId: { not: null },
  OR: [
    { method: 'paypal', txId: { startsWith: 'I-' } },
    { method: 'dodo', status: 'subscription_active' },
  ],
};

export async function currentSubscriptionRecord(userId: string) {
  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId } });
  return prisma.payment.findFirst({
    where: { userId, ...subscriptionRecordWhere, ...(pointer ? { method: pointer.provider, txId: pointer.subscriptionId } : {}) },
    select: { method: true, txId: true, plan: true },
    orderBy: [{ activatedAt: 'desc' }, { createdAt: 'desc' }],
  });
}
