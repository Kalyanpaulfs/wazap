import {responseState,chatResponseState} from "@/lib/support-queue";
import {supportMonitorHealth} from "@/lib/support-monitor";
import {activeCrmContacts,CRM_TRASH_TAG} from "@/lib/crm-trash";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sameSiteRequest } from "@/lib/crm";
import { prisma } from "@/lib/prisma";
import { flaggedConversationCount, replyToConversation, setConversationStatus, type AdminReplyAttachment } from "@/lib/support-admin-service";
import { supportReference } from "@/lib/support-handoff";
import { checkAttachment } from "@/lib/support-attachment";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return Boolean((session?.user as any)?.isAdmin);
}

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function getConversations() {
  const conversations = await prisma.supportConversation.findMany({
    where:{OR:[{crmLeadId:null},{crmLead:activeCrmContacts}]},
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 100, include: { attachments: { select: { id: true, mimeType: true } } } } },
  });

  return conversations.map(c => ({
    ...chatResponseState(c),
    id: c.id,
    reference: supportReference(c.id),
    flagged: c.status === "open",
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
    messages: c.messages.slice().reverse().map(m => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      readByAdmin: m.readByAdmin,
      readByVisitor: m.readByVisitor,
      createdAt: m.createdAt.toISOString(),
      attachments: m.attachments,
    })),
  }));
}

async function getRequests(){
 const trashed=await prisma.crmLead.findMany({where:{tags:{has:CRM_TRASH_TAG}},select:{email:true}});
 const rows=await prisma.contactMessage.findMany({where:{NOT:{OR:trashed.map(lead=>({email:{equals:lead.email,mode:'insensitive' as const}}))}},orderBy:{createdAt:'desc'},take:100});
 const leads=await prisma.crmLead.findMany({where:{email:{in:rows.map(r=>r.email.toLowerCase())}},select:{id:true,email:true}});
 const relations=await prisma.crmActivity.findMany({where:{sourceKey:{in:rows.map(r=>"support-thread:"+r.id)}},select:{sourceKey:true,body:true}});
 const qa=await prisma.crmActivity.findMany({where:{sourceKey:{in:rows.map(r=>"support-qa:"+r.id)}},select:{sourceKey:true,body:true}});
 const parentIds=relations.map(r=>r.body);const parents=await prisma.contactMessage.findMany({where:{id:{in:parentIds}},select:{id:true,subject:true,message:true,adminReply:true}});
 return rows.map(r=>{const parentId=relations.find(x=>x.sourceKey==="support-thread:"+r.id)?.body;const isQa=qa.some(x=>x.sourceKey==="support-qa:"+r.id&&x.body==="true");return {...r,...responseState(r.adminReply||isQa?null:r.createdAt),isQa,parentRequest:parents.find(x=>x.id===parentId)||null,crmLeadId:leads.find(l=>l.email===r.email.toLowerCase())?.id||null};});
}
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ health:await supportMonitorHealth(), conversations: await getConversations(), requests: await getRequests(), flaggedCount: await flaggedConversationCount() }, {headers:{"Cache-Control":"no-store"}});
}

// A reply is either a plain JSON {conversationId,message} (text-only, the
// original shape) or, for a reply that attaches a screenshot, multipart form
// data: conversationId, an optional message/caption, and the file. Same
// admin check and same sameSiteRequest check either way; only the body
// parsing differs.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});

  let conversationId: unknown;
  let cleanMessage = "";
  let attachment: AdminReplyAttachment | undefined;

  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
    conversationId = form.get("conversationId");
    cleanMessage = cleanText(form.get("message"));
    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "A screenshot is required." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkAttachment(bytes.byteLength, bytes);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
    attachment = { mimeType: check.mimeType, size: bytes.byteLength, data: Buffer.from(bytes) };
  } else {
    const json = await req.json().catch(() => ({}));
    conversationId = json.conversationId;
    cleanMessage = cleanText(json.message);
  }

  if (!conversationId || (!cleanMessage && !attachment)) {
    return NextResponse.json({ error: "Missing conversation or message." }, { status: 400 });
  }

  const result = await replyToConversation(String(conversationId), cleanMessage, attachment);
  if (!result) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ health:await supportMonitorHealth(), conversations: await getConversations(), requests: await getRequests(), flaggedCount: await flaggedConversationCount() }, {headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const { conversationId, status, read, readThroughAt } = await req.json().catch(()=>({}));
  if(status!==undefined&&!['open','closed'].includes(status))return NextResponse.json({error:"Invalid status."},{status:400});
  if (!conversationId) return NextResponse.json({ error: "Missing conversation." }, { status: 400 });

  await prisma.supportChatMessage.updateMany({
    where: { conversationId, sender: "visitor", ...(readThroughAt&&Number.isFinite(Date.parse(readThroughAt))?{createdAt:{lte:new Date(readThroughAt)}}:{}) },
    data: { readByAdmin: read!==false },
  });

  if (status === "open" || status === "closed") {
    await setConversationStatus(conversationId, status);
  }

  return NextResponse.json({ health:await supportMonitorHealth(), conversations: await getConversations(), requests: await getRequests(), flaggedCount: await flaggedConversationCount() }, {headers:{"Cache-Control":"no-store"}});
}
