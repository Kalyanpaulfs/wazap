import { customerLanguage } from "./customer-email";
import { localizedReceipt, localizedBillingNotice } from "./billing-email-localized";
import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { renderPaidReceiptEmail } from "./email";
const labels: Record<string, string> = {basic:"Solo",pro:"Growth",ultimate:"Agency",business:"Business"};
function escape(value: string) {return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
export function billingNoticeContent(opts: {name: string | null; plan: string; state: "cancelled" | "failed" | "expired" | "paused"; accessUntil?: Date | null}) {
 const title = {cancelled:"Subscription renewal cancelled",failed:"Your subscription payment needs attention",expired:"Your paid subscription has ended",paused:"Your subscription needs attention"}[opts.state];
 const date=opts.accessUntil?opts.accessUntil.toLocaleDateString("en-GB",{timeZone:"Asia/Dubai",dateStyle:"long"}):null;
 const detail=opts.state==="cancelled"?`Renewal of your ${escape(labels[opts.plan]||opts.plan)} subscription has been cancelled.${date?` Your current paid access remains available until ${escape(date)}.`:""} If you choose to subscribe again, you can review the available plans below.`:opts.state==="failed"?"Your payment provider reported a failed subscription payment. Review your subscription and payment method in your billing settings. This message is not confirmation of a successful charge.":opts.state==="expired"?"Your paid subscription period has ended and your account now uses Free limits. You can choose a new subscription when you are ready.":"Your payment provider reported a subscription hold. Review the subscription in your billing settings or contact our billing team.";
 return {subject:`Wazap billing: ${title.toLowerCase()}`,html:`<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;background:#0b120d;border:1px solid #24442d;border-radius:18px;color:#dbe7de"><div style="padding:24px 28px;color:#25d366;font-size:22px;font-weight:bold">Wazap</div><div style="padding:0 28px 28px"><p>Hi${opts.name?` ${escape(opts.name)}`:""},</p><h1 style="color:#ffffff;font-size:26px">${title}</h1><p style="line-height:1.7">${detail}</p><p><a href="https://wazap.lt/account" style="color:#25d366">Review billing settings</a> · <a href="https://wazap.lt/pricing" style="color:#25d366">View subscription plans</a></p><p style="font-size:12px;color:#9fb0a3">This is a notice about your Wazap subscription. Questions? Reply to billing@wazap.lt.</p></div></div>`};
}
export async function queueBillingNotice(opts: {key:string; userId:string; email:string; name:string|null;plan:string;state:"cancelled"|"failed"|"expired"|"paused";accessUntil?:Date|null}, db: Prisma.TransactionClient | typeof prisma = prisma) {
 const content=localizedBillingNotice(opts,await customerLanguage(opts.email)); const id="billing_"+createHash("sha256").update(opts.key+":"+opts.userId).digest("hex");
 await db.outboundEmail.upsert({where:{id},update:{},create:{id,userId:opts.userId,recipient:opts.email,type:`billing_${opts.state}`,subject:content.subject,html:content.html}});
}
export async function queuePaidReceipt(opts: {key:string;userId:string;email:string;name:string|null;plan:string;amount:number;txId:string|null}, db: Prisma.TransactionClient | typeof prisma = prisma) {
 const id="receipt_"+createHash("sha256").update(opts.key+":"+opts.userId).digest("hex");
 await db.outboundEmail.upsert({where:{id},update:{},create:{id,userId:opts.userId,recipient:opts.email,type:"billing_receipt",...localizedReceipt(opts,await customerLanguage(opts.email))}});
}
