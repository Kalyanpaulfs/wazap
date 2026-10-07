import {requestNewsletter} from "@/lib/crm-marketing";
import {NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {rateLimit} from "@/lib/rate-limit";
import {requestIp} from "@/lib/request-ip";
import {capturedChat,captureCrmLead,crmText,normalizeContactPhone,sameSiteRequest,validEmail} from "@/lib/crm";
const visitorPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function GET(req:Request){const visitorId=crmText(new URL(req.url).searchParams.get("visitorId"),120);if(!visitorPattern.test(visitorId))return NextResponse.json({ready:false});return NextResponse.json({ready:Boolean(await capturedChat(visitorId))},{headers:{"Cache-Control":"no-store"}});}
export async function POST(req:Request){
 if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
 if(!rateLimit(`chat-profile:${requestIp(req.headers)}`,12,3600000))return NextResponse.json({error:"Too many requests. Please try again later."},{status:429});
 const body=await req.json().catch(()=>({}));const visitorId=crmText(body.visitorId,120);const name=crmText(body.name);const email=crmText(body.email,255).toLowerCase();const phone=normalizeContactPhone(body.phone);
 if(!visitorPattern.test(visitorId)||name.length<2||!validEmail(email)||!phone)return NextResponse.json({error:"Enter your full name, a valid email and a phone number with country code, such as +971501234567."},{status:400});
 const current=await capturedChat(visitorId);
 if(current)return NextResponse.json({ready:true});
 try {
 await prisma.$transaction(async tx=>{
  const lead=await captureCrmLead(tx,{name,email,phone,source:"website_chat"});
  if(body.newsletter===true)await requestNewsletter(tx,lead,"website chat");
  const conversation=await tx.supportConversation.upsert({where:{visitorId},create:{visitorId,name,email,phone,crmLeadId:lead.id,contactCapturedAt:new Date(),status:"ai",subject:"Website chat"},update:{name,email,phone,crmLeadId:lead.id,contactCapturedAt:new Date()}});
  await tx.crmActivity.upsert({where:{sourceKey:`chat-profile:${conversation.id}`},create:{leadId:lead.id,kind:"capture",body:"Contact details submitted before website chat. Self-reported details; marketing permission was not granted.",sourceKey:`chat-profile:${conversation.id}`},update:{}});
 });
 return NextResponse.json({ready:true},{status:201});
 } catch {return NextResponse.json({error:"Your details could not be saved. Please retry."},{status:503});}
}
