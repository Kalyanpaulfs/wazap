import {isCrmTrashed} from "@/lib/crm-trash";
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {crmText, sameSiteRequest, validEmail, normalizeContactPhone, captureCrmLead} from '@/lib/crm';
import {audienceFingerprint,cleanFilters,audienceWhere,eligibleAudience,renderCampaign,campaignUrl,marketingReadiness,unsubscribeLead,resolveGroupSegmentId,CUSTOMER_GROUPS} from '@/lib/crm-marketing';
import {customerSegment} from '@/lib/entitlements';
import {rateLimit} from '@/lib/rate-limit';
const noStore={'Cache-Control':'no-store'};
async function admin(){const s=await getServerSession(authOptions);const u=s?.user as {id?:string;isAdmin?:boolean}|undefined;return u?.isAdmin?u.id:null;}
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
const monthKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
function last12Months(){const months:string[]=[];const now=new Date();for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(monthKey(d));}return months;}
export async function GET(req:Request){
 if(!await admin())return error('Forbidden',403);const params=new URL(req.url).searchParams;
 try{
 if(params.get('view')==='export'){
 const filters=cleanFilters(Object.fromEntries(params));const leads=await prisma.crmLead.findMany({where:await audienceWhere(filters),orderBy:{createdAt:'desc'},take:10001});if(leads.length>10000)return error('Narrow this export to 10,000 contacts or fewer.');const cell=(value:unknown)=>{let v=String(value??'');if(/^[\s]*[=+@-]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};const keys=['name','email','phone','company','stage','source','marketingStatus','consentAt','consentSource','doNotContact','tags'];const csv=[keys.join(','),...leads.map(l=>keys.map(k=>cell(k==='tags'?l.tags.join(';'):(l as unknown as Record<string,unknown>)[k])).join(','))].join('\r\n');return new Response(csv,{headers:{...noStore,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="wazap-contacts.csv"'}});
 }
 if(params.get('view')==='audience'){
 const segmentId=crmText(params.get('segment'));const segment=segmentId?await prisma.crmSegment.findUnique({where:{id:segmentId}}):null;if(segmentId&&!segment)return error('Audience not found.',404);const filters=cleanFilters(segment?.filters||Object.fromEntries(params));const where=await audienceWhere(filters);const eligible=await eligibleAudience(prisma,filters);const [total,count,sample,identities]=await Promise.all([prisma.crmLead.count({where}),prisma.crmLead.count({where:eligible}),prisma.crmLead.findMany({where:eligible,take:10,select:{name:true,email:true}}),prisma.crmLead.findMany({where:eligible,take:1001,select:{id:true,email:true}})]);return NextResponse.json({total,eligible:count,excluded:total-count,sample,filters,fingerprint:count<=1000?audienceFingerprint(identities):null},{headers:noStore});
 }
 if(params.get('campaign')){
 const campaign=await prisma.crmCampaign.findUnique({where:{id:params.get('campaign')!},include:{segment:true}});if(!campaign)return error('Campaign not found.',404);const counts=await prisma.crmCampaignRecipient.groupBy({by:['status'],where:{campaignId:campaign.id},_count:{_all:true}});const recipients=await prisma.crmCampaignRecipient.findMany({where:{campaignId:campaign.id},orderBy:{createdAt:'desc'},take:100,select:{id:true,email:true,status:true,attempts:true,sentAt:true,deliveredAt:true,lastError:true}});const html=renderCampaign(campaign,'https://wazap.lt/newsletter');return NextResponse.json({campaign,counts,recipients,html},{headers:noStore});
 }
 if(params.get('view')==='overview'){
 const now=new Date();const weekAgo=new Date(now.getTime()-7*86400000);
 const users=await prisma.user.findMany({select:{plan:true,planExpiresAt:true,trialEndsAt:true,trialPlan:true,createdAt:true}});
 let paidActive=0,trial=0,expired=0,free=0,newSignups7d=0;
 for(const u of users){const segment=customerSegment(u,now);if(segment==='paid')paidActive++;else if(segment==='trial')trial++;else if(segment==='expired')expired++;else free++;if(u.createdAt>=weekAgo)newSignups7d++;}
 return NextResponse.json({totalUsers:users.length,paidActive,trial,expired,free,newSignups7d},{headers:noStore});
 }
 if(params.get('view')==='reports'){
 const months=last12Months();const since=new Date(`${months[0]}-01T00:00:00.000Z`);
 const [payments,expiredUsers]=await Promise.all([
 prisma.payment.findMany({where:{createdAt:{gte:since}},select:{userId:true,plan:true,amount:true,currency:true,status:true,createdAt:true}}),
 prisma.user.findMany({where:{plan:{not:'free'},planExpiresAt:{gte:since,lte:new Date()}},select:{planExpiresAt:true}}),
 ]);
 const income:Record<string,Record<string,number>>={},plansSold:Record<string,Record<string,number>>={},refunds:Record<string,Record<string,number>>={},refundCount:Record<string,number>={},newPaidCustomers:Record<string,Set<string>>={},expiredByMonth:Record<string,number>={};
 for(const m of months){income[m]={};plansSold[m]={};refunds[m]={};refundCount[m]=0;newPaidCustomers[m]=new Set();expiredByMonth[m]=0;}
 for(const p of payments){
 const m=monthKey(p.createdAt);if(!(m in income))continue;
 if(p.status==='active'){income[m][p.currency]=(income[m][p.currency]||0)+p.amount;plansSold[m][p.plan]=(plansSold[m][p.plan]||0)+1;if(p.userId)newPaidCustomers[m].add(p.userId);}
 else if(['refunded','partially_refunded','charged_back'].includes(p.status)){refundCount[m]++;refunds[m][p.currency]=(refunds[m][p.currency]||0)+p.amount;}
 }
 for(const u of expiredUsers){if(u.planExpiresAt){const m=monthKey(u.planExpiresAt);if(m in expiredByMonth)expiredByMonth[m]++;}}
 const newPaidByMonth=Object.fromEntries(months.map(m=>[m,newPaidCustomers[m].size]));
 return NextResponse.json({months,income,plansSold,refunds,refundCount,newPaidByMonth,expiredByMonth},{headers:noStore});
 }
 if(params.get('view')==='broadcast'||!params.get('view')){
 const [campaigns,readiness]=await Promise.all([prisma.crmCampaign.findMany({orderBy:{updatedAt:'desc'},take:100,include:{segment:{select:{name:true}},_count:{select:{recipients:true}}}}),marketingReadiness(params.get('refresh')==='1')]);
 return NextResponse.json({campaigns,readiness},{headers:noStore});
 }
 return error('Unknown view.',404);
 }catch{return error('This workspace could not be loaded. Please retry.',503);}
}
export async function POST(req:Request){
 const actorId=await admin();if(!actorId)return error('Forbidden',403);if(!sameSiteRequest(req))return error('Invalid origin.',403);if(!rateLimit(`crm-marketing:${actorId}`,90,60000))return error('Please wait before trying again.',429);const body=await req.json().catch(()=>({}));const action=crmText(body.action);
 try{
 if(action==='saveCampaign'){
 const ctaUrl=campaignUrl(body.ctaUrl);const group=crmText(body.customerGroup)||'all';if(!(CUSTOMER_GROUPS as readonly string[]).includes(group))return error('Choose a valid audience group.');
 const segmentId=await resolveGroupSegmentId(prisma,actorId,group);
 const data={name:crmText(body.name),subject:crmText(body.subject,150),preheader:crmText(body.preheader,180),heading:crmText(body.heading,180),body:crmText(body.body,20000),ctaLabel:crmText(body.ctaLabel,60),ctaUrl:ctaUrl||'',segmentId};
 if(!data.name||!data.subject||!data.heading||!data.body||ctaUrl===null||!!data.ctaLabel!==!!data.ctaUrl)return error('Complete the name, subject, heading and message. A button needs both a label and an HTTPS URL.');
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
 const id=crmText(body.leadId);const current=await prisma.crmLead.findUnique({where:{id}});if(!current)return error('Contact not found.',404);if(isCrmTrashed(current))return error("Restore this contact before editing it.",409);if(current.updatedAt.toISOString()!==body.updatedAt)return error('Contact changed. Reload before saving.',409);
 if(action==='tags'){const tags=[...new Set((Array.isArray(body.tags)?body.tags:[]).map((t:unknown)=>crmText(t,40).toLowerCase()).filter(Boolean))] as string[];if(tags.some(t=>t.startsWith("__crm_")))return error("System tags cannot be edited.");if(tags.length>20)return error('Use at most 20 tags.');await prisma.$transaction(async tx=>{const changed=await tx.crmLead.updateMany({where:{id,updatedAt:current.updatedAt},data:{tags}});if(!changed.count)throw new Error('Conflict');await tx.crmActivity.create({data:{leadId:id,actorId,kind:'tags',body:`Tags updated: ${tags.join(', ')||'none'}`}});});return NextResponse.json({ok:true});}
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
