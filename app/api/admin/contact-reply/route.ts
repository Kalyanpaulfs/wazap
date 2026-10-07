import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {sameSiteRequest} from "@/lib/crm";
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
  const { messageId, reply } = await req.json().catch(()=>({}));
  const cleanReply = cleanText(reply);
  if (!messageId || !cleanReply) {
    return NextResponse.json({ error: "Missing message or reply." }, { status: 400 });
  }

  const contactMessage = await prisma.contactMessage.update({
    where: { id: messageId },
    data: {
      adminReply: cleanReply,
      repliedAt: new Date(),
      adminReplySeenAt: null,
      read: true,
    },
  });

  const lead=await prisma.crmLead.findUnique({where:{email:contactMessage.email.toLowerCase()},select:{id:true}});
  if(lead)await prisma.crmActivity.create({data:{leadId:lead.id,kind:'support_reply',body:`Support reply (${contactMessage.subject}): ${cleanReply}`}});
  const subject = `Wazap support replied: ${contactMessage.subject}`;
  const outbound = await prisma.outboundEmail.create({
    data: {
      recipient: contactMessage.email.toLowerCase(),
      type: "support_reply",
      subject,
      html: renderSupportReplyEmail({
        name: contactMessage.name,
        subject: contactMessage.subject,
        reply: cleanReply,
        base: process.env.NEXTAUTH_URL ?? "https://wazap.lt",
      }),
    },
  });
  const emailResult = await sendEmail({ to: outbound.recipient, subject: outbound.subject, html: outbound.html });
  await prisma.outboundEmail.update({
    where: { id: outbound.id },
    data: emailResult.accepted
      ? { status: "accepted", sentAt: new Date(), attempts: 1, lastError: null, provider: emailResult.provider, providerMessageId: emailResult.messageId }
      : { attempts: 1, nextAttemptAt: new Date(Date.now() + 2 * 60 * 60 * 1000), lastError: emailResult.error || "Provider request failed", provider: emailResult.provider },
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
