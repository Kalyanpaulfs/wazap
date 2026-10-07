import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {crmText, sameSiteRequest, validEmail, normalizeContactPhone, captureCrmLead} from '@/lib/crm';
import {audienceFingerprint,cleanFilters,audienceWhere,eligibleAudience,renderCampaign,campaignUrl,marketingReadiness,unsubscribeLead} from '@/lib/crm-marketing';
import {rateLimit} from '@/lib/rate-limit';
import type {Prisma} from '@prisma/client';
const noStore={'Cache-Control':'no-store'};
async function admin(){const s=await getServerSession(authOptions);const u=s?.user as {id?:string;isAdmin?:boolean}|undefined;return u?.isAdmin?u.id:null;}
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function GET(req:Request){
 if(!await admin())return error('Forbidden',403);const params=new URL(req.url).searchParams;
 try{
 if(params.get('view')==='pipeline'){
 const stages=['new','contacted','qualified','proposal','won','lost'];const columns=await Promise.all(stages.map(async stage=>({stage,total:await prisma.crmLead.count({where:{stage}}),leads:await prisma.crmLead.findMany({where:{stage},orderBy:{lastActivityAt:'desc'},take:50,select:{id:true,name:true,email:true,company:true,value:true,currency:true,ownerId:true,lastActivityAt:true}})})));return NextResponse.json({columns},{headers:noStore});
 }
 if(params.get('view')==='export'){
 const filters=cleanFilters(Object.fromEntries(params));const leads=await prisma.crmLead.findMany({where:audienceWhere(filters),orderBy:{createdAt:'desc'},take:10001});if(leads.length>10000)return error('Narrow this export to 10,000 contacts or fewer.');const cell=(value:unknown)=>{let v=String(value??'');if(/^[\s]*[=+@-]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};const keys=['name','email','phone','company','stage','source','marketingStatus','consentAt','consentSource','doNotContact','tags'];const csv=[keys.join(','),...leads.map(l=>keys.map(k=>cell(k==='tags'?l.tags.join(';'):(l as unknown as Record<string,unknown>)[k])).join(','))].join('\r\n');return new Response(csv,{headers:{...noStore,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="wazap-contacts.csv"'}});
 }
 if(params.get('view')==='audience'){
 const segmentId=crmText(params.get('segment'));const segment=segmentId?await prisma.crmSegment.findUnique({where:{id:segmentId}}):null;if(segmentId&&!segment)return error('Audience not found.',404);const filters=cleanFilters(segment?.filters||Object.fromEntries(params));const where=audienceWhere(filters);const eligible=await eligibleAudience(prisma,filters);const [total,count,sample,identities]=await Promise.all([prisma.crmLead.count({where}),prisma.crmLead.count({where:eligible}),prisma.crmLead.findMany({where:eligible,take:10,select:{name:true,email:true}}),prisma.crmLead.findMany({where:eligible,take:1001,select:{id:true,email:true}})]);return NextResponse.json({total,eligible:count,excluded:total-count,sample,filters,fingerprint:count<=1000?audienceFingerprint(identities):null},{headers:noStore});
 }
 if(params.get('campaign')){
 const campaign=await prisma.crmCampaign.findUnique({where:{id:params.get('campaign')!},include:{segment:true}});if(!campaign)return error('Campaign not found.',404);const counts=await prisma.crmCampaignRecipient.groupBy({by:['status'],where:{campaignId:campaign.id},_count:{_all:true}});const recipients=await prisma.crmCampaignRecipient.findMany({where:{campaignId:campaign.id},orderBy:{createdAt:'desc'},take:100,select:{id:true,email:true,status:true,attempts:true,sentAt:true,deliveredAt:true,lastError:true}});const html=renderCampaign(campaign,'https://wazap.lt/newsletter');return NextResponse.json({campaign,counts,recipients,html},{headers:noStore});
 }
 const [total,permissions,stages,sources,tags,tasks,segments,campaigns,statuses,values,recent,opened,clicked,dueTotal,taskTotal,campaignTotal]=await Promise.all([
 prisma.crmLead.count(),prisma.crmLead.groupBy({by:['marketingStatus'],_count:{_all:true}}),prisma.crmLead.groupBy({by:['stage'],_count:{_all:true}}),prisma.crmLead.groupBy({by:['source'],_count:{_all:true}}),prisma.crmLead.findMany({select:{tags:true}}),prisma.crmTask.findMany({where:{completedAt:null,lead:{doNotContact:false}},orderBy:{dueAt:'asc'},take:100,include:{lead:{select:{id:true,name:true,email:true,stage:true}}}}),prisma.crmSegment.findMany({orderBy:{updatedAt:'desc'}}),prisma.crmCampaign.findMany({orderBy:{updatedAt:'desc'},take:100,include:{segment:{select:{name:true}},_count:{select:{recipients:true}}}}),prisma.crmCampaignRecipient.groupBy({by:['status'],_count:{_all:true}}),prisma.crmLead.groupBy({by:['currency','stage'],_sum:{value:true}}),prisma.crmActivity.findMany({orderBy:{createdAt:'desc'},take:10,include:{lead:{select:{id:true,name:true}}}}),prisma.crmCampaignRecipient.count({where:{openedAt:{not:null}}}),prisma.crmCampaignRecipient.count({where:{clickedAt:{not:null}}}),prisma.crmTask.count({where:{completedAt:null,dueAt:{lte:new Date()},lead:{doNotContact:false}}}),prisma.crmTask.count({where:{completedAt:null,lead:{doNotContact:false}}}),prisma.crmCampaign.count()]);
 const readiness=params.get('view')==='settings'?await marketingReadiness(params.get('refresh')==='1'):null;
 return NextResponse.json({total,permissions,stages,sources,tags:[...new Set(tags.flatMap(t=>t.tags))].sort(),tasks,segments,campaigns,statuses,values,recent,opened,clicked,dueTotal,taskTotal,campaignTotal,readiness},{headers:noStore});
 }catch{return error('This workspace could not be loaded. Please retry.',503);}
}
export async function POST(req:Request){
 const actorId=await admin();if(!actorId)return error('Forbidden',403);if(!sameSiteRequest(req))return error('Invalid origin.',403);if(!rateLimit(`crm-marketing:${actorId}`,90,60000))return error('Please wait before trying again.',429);const body=await req.json().catch(()=>({}));const action=crmText(body.action);
 try{
 if(action==='saveSegment'){
 const name=crmText(body.name);if(!name)return error('Give this audience a name.');const data={name,description:crmText(body.description,500),filters:cleanFilters(body.filters) as Prisma.InputJsonValue};
 if(body.id){const changed=await prisma.crmSegment.updateMany({where:{id:crmText(body.id),updatedAt:new Date(body.updatedAt)},data});if(!changed.count)return error('Audience changed. Reload before saving.',409);return NextResponse.json({id:body.id});}
 const row=await prisma.crmSegment.create({data:{...data,createdBy:actorId}});return NextResponse.json({id:row.id},{status:201});
 }
 if(action==='saveCampaign'){
 const ctaUrl=campaignUrl(body.ctaUrl);const data={name:crmText(body.name),subject:crmText(body.subject,150),preheader:crmText(body.preheader,180),heading:crmText(body.heading,180),body:crmText(body.body,20000),ctaLabel:crmText(body.ctaLabel,60),ctaUrl:ctaUrl||'',segmentId:crmText(body.segmentId)||null};
 if(!data.name||!data.subject||!data.heading||!data.body||ctaUrl===null||!!data.ctaLabel!==!!data.ctaUrl)return error('Complete the name, subject, heading and message. A button needs both a label and an HTTPS URL.');if(data.segmentId&&!await prisma.crmSegment.findUnique({where:{id:data.segmentId}}))return error('Audience not found.',404);
 if(body.id){const updatedAt=new Date(body.updatedAt);if(Number.isNaN(updatedAt.getTime()))return error('Reload the campaign.');const result=await prisma.crmCampaign.updateMany({where:{id:crmText(body.id),status:'draft',updatedAt},data});if(!result.count)return error('This campaign changed or has already launched. Reload before editing.',409);return NextResponse.json({id:body.id});}
 const campaign=await prisma.crmCampaign.create({data:{...data,createdBy:actorId}});return NextResponse.json({id:campaign.id},{status:201});
 }
 if(action==='queueCampaign'){
 if(body.confirm!==true)return error('Review and confirm the exact campaign before launch.');const readiness=await marketingReadiness(true);if(!readiness.ready)return NextResponse.json({error:'Campaign launch is unavailable until all sending checks pass.',readiness},{status:409});
 const id=crmText(body.id);const scheduledAt=body.scheduledAt?new Date(body.scheduledAt):new Date();if(Number.isNaN(scheduledAt.getTime())||scheduledAt.getTime()<Date.now()-60000||scheduledAt.getTime()>Date.now()+366*86400000)return error('Choose a valid future date within one year.');
 const result=await prisma.$transaction(async tx=>{
 const campaign=await tx.crmCampaign.findUnique({where:{id},include:{segment:true}});if(!campaign||campaign.status!=='draft'||campaign.updatedAt.toISOString()!==body.updatedAt)return {error:'Campaign changed. Reload and review it again.'};
 const where=await eligibleAudience(tx,cleanFilters(campaign.segment?.filters));const leads=await tx.crmLead.findMany({where,take:1001,select:{id:true,email:true}});if(!leads.length||leads.length>1000)return {error:'Choose an audience with 1 to 1,000 eligible subscribers.'};
 if(leads.length!==body.expectedCount||audienceFingerprint(leads)!==body.expectedFingerprint)return {error:'The audience size changed. Review it again before launch.'};
 const changed=await tx.crmCampaign.updateMany({where:{id,status:'draft',updatedAt:campaign.updatedAt},data:{status:'scheduled',scheduledAt,approvedBy:actorId,launchedAt:new Date()}});if(!changed.count)return {error:'This campaign was already launched.'};
 await tx.crmCampaignRecipient.createMany({data:leads.map(l=>({campaignId:id,leadId:l.id,email:l.email,nextAttemptAt:scheduledAt})),skipDuplicates:true});return {queued:leads.length};
 },{isolationLevel:'Serializable',timeout:15000});return 'error' in result?error(result.error!,409):NextResponse.json(result);
 }
 if(action==='cancelCampaign'){
 const id=crmText(body.id);const result=await prisma.$transaction(async tx=>{const changed=await tx.crmCampaign.updateMany({where:{id,status:{in:['scheduled','sending']}},data:{status:'cancelled',completedAt:new Date()}});if(changed.count)await tx.crmCampaignRecipient.updateMany({where:{campaignId:id,status:'queued'},data:{status:'cancelled',lastError:'Campaign cancelled by an administrator.'}});return changed.count;});return result?NextResponse.json({ok:true}):error('Only scheduled or sending campaigns can be cancelled.',409);
 }
 if(action==='tags'||action==='permission'){
 const id=crmText(body.leadId);const current=await prisma.crmLead.findUnique({where:{id}});if(!current)return error('Contact not found.',404);if(current.updatedAt.toISOString()!==body.updatedAt)return error('Contact changed. Reload before saving.',409);
 if(action==='tags'){const tags=[...new Set((Array.isArray(body.tags)?body.tags:[]).map((t:unknown)=>crmText(t,40).toLowerCase()).filter(Boolean))] as string[];if(tags.length>20)return error('Use at most 20 tags.');await prisma.$transaction(async tx=>{const changed=await tx.crmLead.updateMany({where:{id,updatedAt:current.updatedAt},data:{tags}});if(!changed.count)throw new Error('Conflict');await tx.crmActivity.create({data:{leadId:id,actorId,kind:'tags',body:`Tags updated: ${tags.join(', ')||'none'}`}});});return NextResponse.json({ok:true});}
 const status=crmText(body.status);if(status==='unsubscribed'){await prisma.$transaction(tx=>unsubscribeLead(tx,id,'Newsletter permission withdrawn by administrator.'));return NextResponse.json({ok:true});}
 if(status!=='subscribed')return error('Choose subscribed or unsubscribed.');const evidence=crmText(body.evidence,2000);const consentAt=new Date(body.consentAt);if(evidence.length<15||Number.isNaN(consentAt.getTime())||consentAt.getTime()>Date.now()||current.emailSuppressedAt||current.doNotContact)return error('Record dated consent evidence. Suppressed contacts cannot be subscribed.');
 const user=await prisma.user.findFirst({where:{email:{equals:current.email,mode:'insensitive'},marketingOptOutAt:{not:null}},select:{id:true}});if(user||current.marketingStatus==='unsubscribed')return error('This contact opted out. They must confirm a new subscription themselves.',409);
 await prisma.$transaction(async tx=>{const changed=await tx.crmLead.updateMany({where:{id,updatedAt:current.updatedAt},data:{marketingStatus:'subscribed',consentAt,consentSource:'admin_evidence',consentEvidence:evidence}});if(!changed.count)throw new Error('Conflict');await tx.crmActivity.create({data:{leadId:id,actorId,kind:'permission',body:`Newsletter consent recorded with evidence: ${evidence}`}});});return NextResponse.json({ok:true});
 }
 if(action==='import'){
 const rows=body.rows as Record<string,unknown>[];if(!Array.isArray(rows)||!rows.length||rows.length>500)return error('Import 1 to 500 rows at a time.');const normalized=rows.map(row=>({name:crmText(row.name),email:crmText(row.email,255).toLowerCase(),phone:row.phone?normalizeContactPhone(row.phone):null,company:crmText(row.company)||null,source:'import'}));if(normalized.some((r,i)=>r.name.length<2||!validEmail(r.email)||(rows[i].phone&&!r.phone)))return error('Fix invalid names, emails or international phone numbers before importing.');const byEmail=new Map<string,typeof normalized[number]>();for(const row of normalized){const first=byEmail.get(row.email);byEmail.set(row.email,first?{...first,phone:first.phone||row.phone,company:first.company||row.company}:row);}const unique=[...byEmail.values()];const result=await prisma.$transaction(async tx=>{let created=0;for(const row of unique){const exists=await tx.crmLead.findUnique({where:{email:row.email},select:{id:true}});const lead=await captureCrmLead(tx,row);if(!exists)created++;await tx.crmActivity.create({data:{leadId:lead.id,actorId,kind:'import',body:'CSV contact import. Existing ownership and newsletter permission preserved.'}});}return {created,matched:unique.length-created,duplicates:rows.length-unique.length};},{timeout:20000});return NextResponse.json(result);
 }
 return error('Unknown action.');
 }catch(e){const code=(e as {code?:string}).code;return error(code==='P2034'?'Another change happened at the same time. Reload and try again.':'This change could not be saved. Reload and retry.',409);}
}
