import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sameSiteRequest } from "@/lib/crm";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return Boolean((session?.user as any)?.isAdmin);
}

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function getConversations() {
  const conversations = await prisma.supportConversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } },
  });

  return conversations.map(c => ({
    id: c.id,
    visitorId: c.visitorId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    crmLeadId: c.crmLeadId,
    subject: c.subject,
    status: c.status,
    intent: c.intent,
    leadScore: c.leadScore,
    aiSummary: c.aiSummary,
    lastMessageAt: c.lastMessageAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    unread: c.messages.filter(m => m.sender === "visitor" && !m.readByAdmin).length,
    messages: c.messages.map(m => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      readByAdmin: m.readByAdmin,
      readByVisitor: m.readByVisitor,
      createdAt: m.createdAt.toISOString(),
    })),
  }));
}

async function getRequests(){
 const rows=await prisma.contactMessage.findMany({orderBy:{createdAt:'desc'},take:100});
 const leads=await prisma.crmLead.findMany({where:{email:{in:rows.map(r=>r.email.toLowerCase())}},select:{id:true,email:true}});
 return rows.map(r=>({...r,crmLeadId:leads.find(l=>l.email===r.email.toLowerCase())?.id||null}));
}
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ conversations: await getConversations(), requests: await getRequests() }, {headers:{"Cache-Control":"no-store"}});
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const { conversationId, message } = await req.json().catch(()=>({}));
  const cleanMessage = cleanText(message);
  if (!conversationId || !cleanMessage) {
    return NextResponse.json({ error: "Missing conversation or message." }, { status: 400 });
  }

  const conversation=await prisma.supportConversation.findUnique({where:{id:String(conversationId)}});
  if(!conversation)return NextResponse.json({error:"Conversation not found."},{status:404});
  await prisma.$transaction(async tx=>{
  await tx.supportChatMessage.create({
    data: {
      conversationId,
      sender: "admin",
      body: cleanMessage,
      readByAdmin: true,
    },
  });
  await tx.supportConversation.update({
    where: { id: conversationId },
    data: { status: "open", lastMessageAt: new Date() },
  });

  if(conversation.crmLeadId)await tx.crmActivity.create({data:{leadId:conversation.crmLeadId,kind:'support_reply',body:`Support reply: ${cleanMessage}`}});
  });
  return NextResponse.json({ conversations: await getConversations(), requests: await getRequests() }, {headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const { conversationId, status } = await req.json().catch(()=>({}));
  if(status!==undefined&&!['open','closed'].includes(status))return NextResponse.json({error:"Invalid status."},{status:400});
  if (!conversationId) return NextResponse.json({ error: "Missing conversation." }, { status: 400 });

  await prisma.supportChatMessage.updateMany({
    where: { conversationId, sender: "visitor", readByAdmin: false },
    data: { readByAdmin: true },
  });

  if (status === "open" || status === "closed") {
    await prisma.supportConversation.update({ where: { id: conversationId }, data: { status } });
  }

  return NextResponse.json({ conversations: await getConversations(), requests: await getRequests() }, {headers:{"Cache-Control":"no-store"}});
}
