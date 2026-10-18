import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {sameSiteRequest} from "@/lib/crm";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const body = await req.json().catch(()=>({}));
  if (!body.messageId || typeof body.read !== "boolean" && typeof body.testOnly!=="boolean") return NextResponse.json({ error: "Invalid message update." }, { status: 400 });
  if(typeof body.testOnly==="boolean"){
 const row=await prisma.contactMessage.findUnique({where:{id:String(body.messageId)}});if(!row)return NextResponse.json({error:"Request not found"},{status:404});
 const lead=await prisma.crmLead.findUnique({where:{email:row.email.toLowerCase()},select:{id:true}});if(!lead)return NextResponse.json({error:"CRM contact required for classification"},{status:409});
 await prisma.crmActivity.upsert({where:{sourceKey:"support-qa:"+row.id},create:{leadId:lead.id,kind:"support_qa",body:String(body.testOnly),sourceKey:"support-qa:"+row.id},update:{body:String(body.testOnly)}});
 return NextResponse.json({id:row.id,testOnly:body.testOnly});
 }
 const message = await prisma.contactMessage.update({ where: { id: String(body.messageId) }, data: { read: body.read } });
  return NextResponse.json({ id: message.id, read: message.read });
}
