import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AccountClient from "./AccountClient";
import { prisma } from "@/lib/prisma";
import { accountClosureBlockers, ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/account-lifecycle";

export const metadata = {
  title: "Account & Data — Wazap",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?redirect=/account");
  const [user, blockers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { accountDeletionRequestedAt: true, accountDeletionScheduledFor: true, email: true },
    }),
    accountClosureBlockers(userId),
  ]);
  if (!user) redirect("/login?redirect=/account");
  const lead = await prisma.crmLead.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { marketingStatus: true, doNotContact: true, emailSuppressedAt: true },
  });
  return <><div className="mx-auto max-w-5xl px-4 pt-6"><Link className="text-[#25D366]" href="/account/security">Manage two-factor authentication →</Link></div><AccountClient initial={{
    requestedAt: user.accountDeletionRequestedAt?.toISOString() || null,
    scheduledFor: user.accountDeletionScheduledFor?.toISOString() || null,
    graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    blockers,
  }} marketing={{
    subscribed: lead?.marketingStatus === "subscribed",
    locked: Boolean(lead?.doNotContact || lead?.emailSuppressedAt),
  }} /></>;
}
