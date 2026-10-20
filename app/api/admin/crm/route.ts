import {activeCrmContacts,CRM_TRASH_TAG,isCrmTrashed,changeCrmTrash} from "@/lib/crm-trash";
import {NextResponse} from "next/server";
import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {CRM_STAGES,CRM_OPEN_STAGES,crmText,normalizeContactPhone,sameSiteRequest,validEmail,captureCrmLead} from "@/lib/crm";
import {rateLimit} from "@/lib/rate-limit";
import type {Prisma} from "@prisma/client";
async function admin(){const session=await getServerSession(authOptions);const user=session?.user as {id?:string;isAdmin?:boolean}|undefined;return user?.isAdmin&&user.id?user.id:null;}
function failure(error:unknown){const code=(error as {code?:string})?.code;return NextResponse.json({error:code==="P2002"?"A contact with this email already exists.":"The CRM request could not be completed. Please retry."},{status:code==="P2002"?409:503});}
const headers={"Cache-Control":"no-store"};
export async function GET(req:Request){
 if(!await admin())return NextResponse.json({error:"Forbidden"},{status:403});
 const params=new URL(req.url).searchParams;const id=crmText(params.get("id"));
 if(id){const lead=await prisma.crmLead.findUnique({where:{id},include:{activities:{orderBy:{createdAt:"desc"},take:100},tasks:{orderBy:[{completedAt:"asc"},{dueAt:"asc"}],take:100}}});if(!lead)return NextResponse.json({error:"Contact not found."},{status:404});const tickets=await prisma.supportTicket.findMany({where:{conversation:{crmLeadId:id}},orderBy:{createdAt:"desc"},take:20,select:{id:true,number:true,topic:true,status:true,createdAt:true}});return NextResponse.json({lead:{...lead,tickets}},{headers});}
 const query=crmText(params.get("q"),100);const stage=crmText(params.get("stage"));const owner=crmText(params.get("owner"));const due=params.get("due")==="1";const page=Math.max(1,Math.min(10000,Math.floor(Number(params.get("page")))||1));
 const permission=crmText(params.get("permission"));const tag=crmText(params.get("tag"),40).toLowerCase();
 const trash=params.get("trash")==="1";const visibility:Prisma.CrmLeadWhereInput=trash?{tags:{has:CRM_TRASH_TAG}}:activeCrmContacts;
 const where:Prisma.CrmLeadWhereInput={AND:[visibility,...(due?[{stage:{in:CRM_OPEN_STAGES},doNotContact:false,tasks:{some:{completedAt:null,dueAt:{lte:new Date()}}}}]:[])],...(["none","pending","subscribed","unsubscribed"].includes(permission)?{marketingStatus:permission}:{}),...(tag?{tags:{has:tag}}:{}),...(CRM_STAGES.includes(stage as typeof CRM_STAGES[number])?{stage}:{}),...(owner?{ownerId:owner==="unassigned"?null:owner}:{}),...(query?{OR:[{name:{contains:query,mode:"insensitive"}},{email:{contains:query,mode:"insensitive"}},{phone:{contains:query}},{company:{contains:query,mode:"insensitive"}}]}:{})};
 const [leads,total,stages,dueCount,owners]=await Promise.all([prisma.crmLead.findMany({where,orderBy:{lastActivityAt:"desc"},skip:(page-1)*25,take:25,include:{tasks:{where:{completedAt:null},orderBy:{dueAt:"asc"},take:1},_count:{select:{conversations:true}}}}),prisma.crmLead.count({where}),prisma.crmLead.groupBy({where:visibility,by:["stage"],_count:{_all:true}}),prisma.crmTask.count({where:{completedAt:null,dueAt:{lte:new Date()},lead:{...activeCrmContacts,stage:{in:CRM_OPEN_STAGES},doNotContact:false}}}),prisma.user.findMany({where:{isAdmin:true},select:{id:true,name:true,email:true}})]);
 return NextResponse.json({leads,total,page,stages:stages.map(row=>({stage:row.stage,count:row._count._all})),dueCount,owners},{headers});
}
export async function POST(req:Request){
 const actorId=await admin();if(!actorId)return NextResponse.json({error:"Forbidden"},{status:403});if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});if(!rateLimit(`crm-write:${actorId}`,60,60000))return NextResponse.json({error:"Please wait before making more changes."},{status:429});
 const body=await req.json().catch(()=>({}));const action=crmText(body.action,30);
 try {
 if(action==="restore")return handleTrash(body,actorId,true);
 if(action==="create"){
  const name=crmText(body.name);const email=crmText(body.email,255).toLowerCase();const phone=body.phone?normalizeContactPhone(body.phone):null;
  if(name.length<2||!validEmail(email)||(body.phone&&!phone))return NextResponse.json({error:"Enter a name, valid email and an international phone number if provided."},{status:400});
  const lead=await prisma.$transaction(async tx=>{const result=await captureCrmLead(tx,{name,email,phone,company:crmText(body.company)||null,source:"manual"});await tx.crmActivity.create({data:{leadId:result.id,actorId,kind:"capture",body:"Contact added manually by an administrator."}});return result;});return NextResponse.json({id:lead.id},{status:201});
 }
 const leadId=crmText(body.leadId);if(leadId){const item=await prisma.crmLead.findUnique({where:{id:leadId},select:{tags:true}});if(item&&isCrmTrashed(item))return NextResponse.json({error:"Restore this contact before editing it."},{status:409});}
 if(!leadId||!await prisma.crmLead.findUnique({where:{id:leadId},select:{id:true}}))return NextResponse.json({error:"Contact not found."},{status:404});
 if(action==="note"){const note=crmText(body.note,5000);if(!note)return NextResponse.json({error:"Enter a note."},{status:400});await prisma.$transaction([prisma.crmActivity.create({data:{leadId,actorId,kind:"note",body:note}}),prisma.crmLead.update({where:{id:leadId},data:{lastActivityAt:new Date()}})]);return NextResponse.json({ok:true});}
 if(action==="task"){const restricted=await prisma.crmLead.findUnique({where:{id:leadId},select:{doNotContact:true}});if(restricted?.doNotContact)return NextResponse.json({error:"Follow-up outreach is restricted for this contact."},{status:409});const title=crmText(body.title,200);const dueAt=new Date(body.dueAt);if(!title||Number.isNaN(dueAt.getTime()))return NextResponse.json({error:"Enter a task and valid due date."},{status:400});await prisma.$transaction([prisma.crmTask.create({data:{leadId,title,dueAt}}),prisma.crmActivity.create({data:{leadId,actorId,kind:"task",body:`Follow-up scheduled: ${title}`}})]);return NextResponse.json({ok:true});}
 if(action==="completeTask"){const taskId=crmText(body.taskId);const changed=await prisma.$transaction(async tx=>{const result=await tx.crmTask.updateMany({where:{id:taskId,leadId,completedAt:null},data:{completedAt:new Date()}});if(result.count)await tx.crmActivity.create({data:{leadId,actorId,kind:"task",body:"Follow-up task completed."}});return result.count;});if(!changed)return NextResponse.json({error:"Task is already complete or not part of this contact."},{status:409});return NextResponse.json({ok:true});}
 return NextResponse.json({error:"Unknown CRM action."},{status:400});
 }catch(error){return failure(error);}
}
export async function PATCH(req:Request){
 const actorId=await admin();if(!actorId)return NextResponse.json({error:"Forbidden"},{status:403});if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
 const body=await req.json().catch(()=>({}));const id=crmText(body.id);const name=crmText(body.name);const email=crmText(body.email,255).toLowerCase();const stage=crmText(body.stage);const phone=body.phone?normalizeContactPhone(body.phone):null;const ownerId=crmText(body.ownerId)||null;const value=Number(body.value);const currency=crmText(body.currency,3).toUpperCase();const updatedAt=new Date(body.updatedAt);
 if(!id||name.length<2||!validEmail(email)||(body.phone&&!phone)||!CRM_STAGES.includes(stage as typeof CRM_STAGES[number])||!Number.isFinite(value)||value<0||value>1e12||!/^([A-Z]{3})$/.test(currency)||Number.isNaN(updatedAt.getTime())||typeof body.doNotContact!=="boolean")return NextResponse.json({error:"Check the contact fields and try again."},{status:400});
 if(ownerId&&!await prisma.user.findFirst({where:{id:ownerId,isAdmin:true},select:{id:true}}))return NextResponse.json({error:"Choose a valid CRM owner."},{status:400});
 try {const result=await prisma.$transaction(async tx=>{const current=await tx.crmLead.findUnique({where:{id}});if(!current)return "missing";if(isCrmTrashed(current))return "conflict";const changed=await tx.crmLead.updateMany({where:{id,updatedAt},data:{name,email,phone,company:crmText(body.company)||null,stage,ownerId,value,currency,doNotContact:body.doNotContact,lastActivityAt:new Date(),...(current.email!==email?{marketingStatus:"none",consentAt:null,consentSource:null,consentEvidence:null,confirmationNonce:crypto.randomUUID(),confirmationRequestedAt:null}:{} )}});if(!changed.count)return "conflict";if(current.email!==email||body.doNotContact)await tx.crmCampaignRecipient.updateMany({where:{leadId:id,status:"queued"},data:{status:"cancelled",lastError:current.email!==email?"Contact email changed. New permission required.":"Contact restricted."}});if(current.email!==email)await tx.outboundEmail.updateMany({where:{recipient:current.email,type:"crm_subscription_confirmation",status:"queued"},data:{status:"cancelled",lastError:"Contact email changed."}});await tx.crmActivity.create({data:{leadId:id,actorId,kind:current.stage!==stage?"stage":"update",body:current.stage!==stage?`Stage changed from ${current.stage} to ${stage}.`:"Contact details, ownership or follow-up preferences updated."}});return "ok";});if(result!=="ok")return NextResponse.json({error:result==="missing"?"Contact not found.":"This record changed while you were editing. Reload it before saving."},{status:result==="missing"?404:409});return NextResponse.json({ok:true});}catch(error){return failure(error);}
}

async function handleTrash(body:Record<string,unknown>,actorId:string,restore:boolean){
 const id=crmText(body.id);const updatedAt=new Date(String(body.updatedAt||""));const reason=crmText(body.reason,500);
 if(!id||Number.isNaN(updatedAt.getTime())||(!restore&&reason.length<3))return NextResponse.json({error:"Choose a contact and provide a reason."},{status:400});
 try{const result=await prisma.$transaction(tx=>changeCrmTrash(tx,{id,updatedAt,actorId,restore,reason}),{isolationLevel:"Serializable"});
 return result==="ok"?NextResponse.json({ok:true}):NextResponse.json({error:result==="missing"?"Contact not found.":"This contact changed. Reload before continuing."},{status:result==="missing"?404:409});
 }catch(error){return failure(error);}
}
export async function DELETE(req:Request){
 const actorId=await admin();if(!actorId)return NextResponse.json({error:"Forbidden"},{status:403});
 if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
 if(!rateLimit(`crm-write:${actorId}`,60,60000))return NextResponse.json({error:"Please wait before making more changes."},{status:429});
 return handleTrash(await req.json().catch(()=>({})),actorId,false);
}
