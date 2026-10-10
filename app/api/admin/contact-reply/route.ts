import {sameSiteRequest} from "@/lib/crm";
import {outboundMessageId} from "@/lib/support-threading";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderSupportReplyEmail, sendEmail } from "@/lib/email";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const { messageId, reply } = await req.json();
  const cleanReply = cleanText(reply);
  if (!messageId || !cleanReply) {
    return NextResponse.json({ error: "Missing message or reply." }, { status: 400 });
  }

  const {contactMessage,outbound} = await prisma.$transaction(async tx => {
  const contactMessage = await tx.contactMessage.update({
    where: { id: messageId },
    data: {
      adminReply: cleanReply,
      repliedAt: new Date(),
      adminReplySeenAt: null,
      read: true,
    },
  });

  const subject = `Wazap support replied: ${contactMessage.subject}`;
  const outbound = await tx.outboundEmail.create({
    data: {
      status: "processing",
      attempts: 1,
      recipient: contactMessage.email.toLowerCase(),
      type: contactMessage.subject === "billing" ? "billing_support_reply" : "support_reply",
      subject,
      html: renderSupportReplyEmail({
        name: contactMessage.name,
        subject: contactMessage.subject,
        reply: cleanReply,
        base: process.env.NEXTAUTH_URL ?? "https://wazap.lt",
      }),
    },
  });
  const lead=await tx.crmLead.findUnique({where:{email:outbound.recipient},select:{id:true}});
  if(lead)await tx.crmActivity.upsert({where:{sourceKey:"support-outbound:"+outbound.id},create:{leadId:lead.id,kind:"support_thread",body:contactMessage.id,sourceKey:"support-outbound:"+outbound.id},update:{}});
  return {contactMessage,outbound};
  });
  const emailResult = await sendEmail({ to: outbound.recipient, subject: outbound.subject, html: outbound.html, channel: contactMessage.subject === "billing" ? "billing" : "support", headers:{"Message-ID":outboundMessageId(outbound.id)} });
  await prisma.outboundEmail.update({
    where: { id: outbound.id },
    data: emailResult.accepted
      ? { status: "accepted", sentAt: new Date(), attempts: 1, lastError: null, provider: emailResult.provider, providerMessageId: emailResult.messageId }
      : { status: emailResult.uncertain ? "unknown" : "queued", attempts: 1, nextAttemptAt: new Date(Date.now() + 2 * 60 * 60 * 1000), lastError: emailResult.error || "Provider request failed", provider: emailResult.provider },
  });

  return NextResponse.json({
    message: {
      id: contactMessage.id,
      read: contactMessage.read,
      adminReply: contactMessage.adminReply,
      repliedAt: contactMessage.repliedAt?.toISOString() ?? null,
      adminReplySeenAt: contactMessage.adminReplySeenAt?.toISOString() ?? null,
      emailSent: emailResult.accepted,
    },
  });
}
