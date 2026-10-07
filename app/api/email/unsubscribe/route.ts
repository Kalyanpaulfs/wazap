import { createHmac, timingSafeEqual } from "crypto";
import {unsubscribeLead} from "@/lib/crm-marketing";
import { prisma } from "@/lib/prisma";

function valid(userId: string, token: string) {
  if (!process.env.NEXTAUTH_SECRET || !userId || !token) return false;
  const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET).update(`marketing:${userId}`).digest("base64url");
  const a = Buffer.from(token), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const url = new URL(req.url), userId = url.searchParams.get("u") || "", token = url.searchParams.get("t") || "";
  if (!valid(userId, token)) return new Response("This unsubscribe link is invalid or incomplete.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  const user=await prisma.user.findUnique({where:{id:userId},select:{email:true}});
  const lead=user?await prisma.crmLead.findUnique({where:{email:user.email.toLowerCase()},select:{id:true}}):null;
  if(lead)await prisma.$transaction(tx=>unsubscribeLead(tx,lead.id));
  await prisma.user.updateMany({ where: { id: userId }, data: { marketingOptOutAt: new Date() } });
  await prisma.outboundEmail.updateMany({ where: { userId, type: { startsWith: "marketing_" }, status: "queued" }, data: { status: "cancelled", lastError: "Recipient opted out of product announcements." } });
  return new Response("<!doctype html><meta name=viewport content='width=device-width'><title>Unsubscribed — Wazap</title><body style='margin:0;background:#08100a;color:#dbe7de;font-family:system-ui'><main style='max-width:560px;margin:12vh auto;padding:32px;border:1px solid #24442d;border-radius:24px;background:#0d1710'><h1 style='color:#25D366'>You are unsubscribed</h1><p>We will no longer send Wazap product announcements to this account. Essential account, security and billing messages are unaffected.</p><a href='https://wazap.lt' style='color:#25D366'>Return to Wazap</a></main></body>", { headers: { "content-type": "text/html; charset=utf-8" } });
}
