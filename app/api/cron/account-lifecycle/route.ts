import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { permanentlyDeleteAccount } from "@/lib/account-lifecycle";
import { renderAccountRestoredEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const due = await prisma.user.findMany({
    where: { accountDeletionScheduledFor: { lte: new Date() } },
    select: { id: true, email: true, name: true },
    orderBy: { accountDeletionScheduledFor: "asc" },
    take: 25,
  });
  const totals = { deleted: 0, blocked: 0, skipped: 0 };
  for (const user of due) {
    const result = await permanentlyDeleteAccount(user.id);
    if (result.deleted) {
      totals.deleted++;
    } else if (result.reason === "blocked") {
      totals.blocked++;
      await prisma.outboundEmail.create({
        data: {
          userId: user.id,
          recipient: user.email,
          type: "account_closure_blocked",
          subject: "Your Wazap account closure was stopped",
          html: renderAccountRestoredEmail({
            name: user.name,
            accountUrl: `${process.env.NEXTAUTH_URL || "https://wazap.lt"}/account`,
          }),
        },
      });
    } else {
      totals.skipped++;
    }
  }
  return NextResponse.json({ ok: true, processed: due.length, ...totals });
}
