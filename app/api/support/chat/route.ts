import {ownsSupport} from "@/lib/support-session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {capturedChat,sameSiteRequest} from "@/lib/crm";
import { requestIp } from "@/lib/request-ip";
import { recordLiveChatTurn } from "@/lib/support-chat-service";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function publicConversation(conversation: {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  messages: { id: string; sender: string; body: string; createdAt: Date; attachments: { id: string; mimeType: string }[] }[];
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
      attachments: m.attachments,
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
    include: { messages: { orderBy: { createdAt: "desc" }, take: 100, include: { attachments: { select: { id: true, mimeType: true } } } } },
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

  const { conversationId } = await recordLiveChatTurn({ visitorId, message, name, email, subject, crmLeadId: profile.crmLeadId });

  const updated = await prisma.supportConversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 100, include: { attachments: { select: { id: true, mimeType: true } } } } },
  });

  return NextResponse.json({ conversation: publicConversation(updated) });
}
