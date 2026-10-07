import {processCrmCampaigns} from "@/lib/crm-campaign-worker";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEmailConfigured()) return NextResponse.json({ delivered: 0, queued: await prisma.outboundEmail.count({ where: { status: "queued" } }), provider: "not_configured" });

  const messages = await prisma.outboundEmail.findMany({ where: { status: "queued", nextAttemptAt: { lte: new Date() }, attempts: { lt: 8 } }, include: { user: { select: { marketingOptOutAt: true } } }, orderBy: { createdAt: "asc" }, take: 25 });
  let delivered = 0;
  for (const message of messages) {
    if (message.type.startsWith("marketing_") && message.user?.marketingOptOutAt) { await prisma.outboundEmail.update({ where: { id: message.id }, data: { status: "cancelled", lastError: "Recipient opted out of product announcements." } }); continue; }
    const result = await sendEmail({ to: message.recipient, subject: message.subject, html: message.html });
    const attempts = message.attempts + 1;
    await prisma.outboundEmail.update({ where: { id: message.id }, data: result.accepted
      ? { status: "sent", sentAt: new Date(), attempts, lastError: null, provider: result.provider, providerMessageId: result.messageId || null }
      : { attempts, nextAttemptAt: new Date(Date.now() + Math.min(24, 2 ** attempts) * 60 * 60 * 1000), lastError: result.error || "Provider request failed" }
    });
    if (result.accepted) delivered++;
  }
  const campaigns = await processCrmCampaigns();
  return NextResponse.json({ delivered, attempted: messages.length, campaigns });
}
