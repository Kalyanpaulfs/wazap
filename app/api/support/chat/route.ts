import {ownsSupport} from "@/lib/support-session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { notifySupportChat, queueSupportAlert } from "@/lib/support-notify";
import {capturedChat,sameSiteRequest} from "@/lib/crm";
import { requestIp } from "@/lib/request-ip";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function publicConversation(conversation: {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  messages: { id: string; sender: string; body: string; createdAt: Date }[];
}) {
  return {
    id: conversation.id,
    name: conversation.name,
    email: conversation.email,
    status: conversation.status,
    messages: [...conversation.messages].reverse().map(m => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const visitorId = cleanText(searchParams.get("visitorId"), 120);
  if (!visitorId) return NextResponse.json({ conversation: null });
  if(!ownsSupport(req,visitorId))return NextResponse.json({error:"Support session required."},{status:403,headers:{"Cache-Control":"no-store"}});

  const conversation = await prisma.supportConversation.findUnique({
    where: { visitorId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 100 } },
  });
  if (!conversation) return NextResponse.json({ conversation: null });


  await prisma.supportChatMessage.updateMany({
    where: { conversationId: conversation.id,
    sender: "admin", readByVisitor: false },
    data: { readByVisitor: true },
  });

  return NextResponse.json({ conversation: publicConversation(conversation) },{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req: Request) {
  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const ip = requestIp(req.headers);
  if (!rateLimit(`support-chat:${ip}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many chat messages. Please wait before sending again." }, { status: 429 });
  }

  const body = await req.json().catch(()=>({}));
  const visitorId = cleanText(body.visitorId, 120);
  const message = cleanText(body.message);
  if(!ownsSupport(req,visitorId))return NextResponse.json({error:"Support session required."},{status:403});
  const profile=await capturedChat(visitorId);
  if(!profile)return NextResponse.json({error:"Please enter your name, email and phone number before starting chat.",contactRequired:true},{status:422});
  const email=profile.email||"";
  const name=profile.name||"";
  const subject = cleanText(body.subject, 200) || "Live support";

  if (!visitorId || !message) {
    return NextResponse.json({ error: "Missing visitor or message." }, { status: 400 });
  }

  const conversation = await prisma.$transaction(async tx=>{
  const saved = await tx.supportConversation.upsert({
    where: { visitorId },
    create: {
      visitorId,
      email: email || null,
      name: name || null,
      subject,
      lastMessageAt: new Date(),
    },
    update: {
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      subject,
      status: "open",
      lastMessageAt: new Date(),
    },
  });

  const incoming = await tx.supportChatMessage.create({
    data: {
      conversationId: saved.id,
      sender: "visitor",
      body: message,
      readByVisitor: true,
    },
  });

  if(profile.crmLeadId)await tx.crmLead.update({where:{id:profile.crmLeadId},data:{lastActivityAt:new Date()}});
  await queueSupportAlert({eventKey:'chat:'+incoming.id,name:saved.name,email:saved.email,subject:'Wazap live support: new customer message',message:incoming.body,link:`https://wazap.lt/admin/crm/support?chat=${encodeURIComponent(saved.id)}`},tx);
  return {...saved,messageId:incoming.id};
  });
  await notifySupportChat({
    name: name || conversation.name,
    email: email || conversation.email,
    message,
    conversationId: conversation.id,
    messageId: conversation.messageId,
  });

  const updated = await prisma.supportConversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 100 } },
  });

  return NextResponse.json({ conversation: publicConversation(updated) });
}
