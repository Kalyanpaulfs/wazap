import {activeCrmContacts} from "./crm-trash";
import { renderLuxuryCampaign } from './email-marketing-template';
import { emailIdentity } from "./email-brand";
import {createHash, createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
import type {Prisma, CrmCampaign, CrmLead} from '@prisma/client';
import {prisma} from './prisma';
import {CRM_STAGES, crmText} from './crm';
import {customerSegment} from './entitlements';
export const CUSTOMER_GROUPS=['all','paid','trial','expired','free'] as const;
export type CustomerGroup=typeof CUSTOMER_GROUPS[number];
export const CUSTOMER_GROUP_LABELS:Record<CustomerGroup,string>={all:'All users',paid:'Paid active',trial:'Free trial',expired:'Expired',free:'Free'};
export type AudienceFilters={stage?:string;source?:string;tag?:string;query?:string;permission?:string;customerGroup?:string};
export function cleanFilters(value:unknown):AudienceFilters {
 const raw=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const stage=crmText(raw.stage);const permission=crmText(raw.permission);const customerGroup=crmText(raw.customerGroup);
 return {stage:CRM_STAGES.includes(stage as typeof CRM_STAGES[number])?stage:'',source:crmText(raw.source,60),tag:crmText(raw.tag,40).toLowerCase(),query:crmText(raw.query,100),permission:['none','pending','subscribed','unsubscribed'].includes(permission)?permission:'',customerGroup:(CUSTOMER_GROUPS as readonly string[]).includes(customerGroup)?customerGroup:''};
}
// Resolves a "Send to" group to the lowercase emails of matching Wazap accounts. Returns
// null for "all"/unset, meaning no extra constraint is applied.
export async function customerGroupEmails(db:Prisma.TransactionClient|typeof prisma,group:string):Promise<string[]|null> {
 if(!group||group==='all')return null;
 const now=new Date();const users=await db.user.findMany({select:{email:true,plan:true,planExpiresAt:true,trialEndsAt:true,trialPlan:true}});
 return users.filter(u=>customerSegment(u,now)===group).map(u=>u.email.toLowerCase());
}
export async function audienceWhere(filters:AudienceFilters,db:Prisma.TransactionClient|typeof prisma=prisma):Promise<Prisma.CrmLeadWhereInput> {
 const base:Prisma.CrmLeadWhereInput={...activeCrmContacts,...(filters.stage?{stage:filters.stage}:{}),...(filters.source?{source:filters.source}:{}),...(filters.tag?{tags:{has:filters.tag}}:{}),...(filters.permission?{marketingStatus:filters.permission}:{}),...(filters.query?{OR:[{name:{contains:filters.query,mode:'insensitive'}},{email:{contains:filters.query,mode:'insensitive'}},{company:{contains:filters.query,mode:'insensitive'}}]}:{})};
 if(!filters.customerGroup||filters.customerGroup==='all')return base;
 const emails=await customerGroupEmails(db,filters.customerGroup);
 return {AND:[base,{email:{in:emails||[]}}]};
}
export async function eligibleAudience(db:Prisma.TransactionClient|typeof prisma,filters:AudienceFilters){
 const [optedOut,where]=await Promise.all([db.user.findMany({where:{marketingOptOutAt:{not:null}},select:{email:true}}),audienceWhere(filters,db)]);
 return {AND:[where,{marketingStatus:'subscribed',consentAt:{not:null},doNotContact:false,emailSuppressedAt:null,email:{notIn:optedOut.map(u=>u.email.toLowerCase())}}]} satisfies Prisma.CrmLeadWhereInput;
}
// Hidden, deterministic per-group segment used by Broadcast campaigns so the existing
// campaign/segment/worker pipeline (and its consent gating) is reused unchanged.
export async function resolveGroupSegmentId(db:Prisma.TransactionClient|typeof prisma,actorId:string,group:string):Promise<string|null> {
 if(!group||group==='all')return null;
 const label=CUSTOMER_GROUP_LABELS[group as CustomerGroup];if(!label)return null;
 const name=`Broadcast: ${label}`;
 const existing=await db.crmSegment.findFirst({where:{name}});if(existing)return existing.id;
 const row=await db.crmSegment.create({data:{name,description:'Automatically managed audience for Broadcast emails.',filters:{customerGroup:group} as Prisma.InputJsonValue,createdBy:actorId}});
 return row.id;
}
export function htmlEscape(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function campaignUrl(value:unknown){const text=crmText(value,1000);if(!text)return '';try{const url=new URL(text);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function signed(action:string,id:string,nonce=''){return createHmac('sha256',process.env.NEXTAUTH_SECRET||'').update(`crm:${action}:${id}:${nonce}`).digest('base64url');}
export function validMarketingToken(action:string,id:string,token:string,nonce=''){if(!process.env.NEXTAUTH_SECRET||!id||!token)return false;const a=Buffer.from(token),b=Buffer.from(signed(action,id,nonce));return a.length===b.length&&timingSafeEqual(a,b);}
export function audienceFingerprint(rows:{id:string;email:string}[]){return createHash("sha256").update(rows.map(r=>`${r.id}:${r.email}`).sort().join("\n")).digest("hex");}
export function preferenceUrl(id:string,email:string){return `${process.env.NEXTAUTH_URL||'https://wazap.lt'}/api/crm/preferences?lead=${encodeURIComponent(id)}&token=${signed('unsubscribe',id,email)}`;}
export function renderCampaign(campaign:Pick<CrmCampaign,'subject'|'preheader'|'heading'|'body'|'ctaLabel'|'ctaUrl'>,unsubscribeUrl:string){
 return renderLuxuryCampaign(campaign, unsubscribeUrl);
}
export async function requestNewsletter(tx:Prisma.TransactionClient,lead:CrmLead,source:string){
 if(lead.marketingStatus==='subscribed'||lead.emailSuppressedAt||lead.doNotContact)return false;
 if(lead.confirmationRequestedAt&&Date.now()-lead.confirmationRequestedAt.getTime()<86400000)return false;
 const nonce=randomUUID();const updated=await tx.crmLead.update({where:{id:lead.id},data:{marketingStatus:'pending',confirmationNonce:nonce,confirmationRequestedAt:new Date()}});
 const link=`${process.env.NEXTAUTH_URL||'https://wazap.lt'}/api/crm/confirm?lead=${lead.id}&nonce=${nonce}&token=${signed('confirm',lead.id,nonce)}`;
 await tx.outboundEmail.create({data:{recipient:lead.email,type:'crm_subscription_confirmation',subject:'Confirm your Wazap newsletter subscription',html:`<div style="font-family:Arial;background:#101810;color:#f4f7f4;padding:30px;max-width:600px;margin:auto"><h1 style="color:#25d366">Confirm your subscription</h1><p>You requested Wazap product updates and practical business tips.</p><p><a style="color:#25d366" href="${htmlEscape(link)}">Confirm my subscription</a></p><p>If you did not request this, ignore this email. The link expires in 7 days.</p></div>`}});
 await tx.crmActivity.create({data:{leadId:updated.id,kind:'permission',body:`Newsletter confirmation requested through ${source}. Marketing permission is pending.`}});return true;
}
export async function unsubscribeLead(tx:Prisma.TransactionClient,id:string,reason='Newsletter unsubscribed'){
 const lead=await tx.crmLead.findUnique({where:{id}});if(!lead)return false;
 await tx.crmLead.update({where:{id},data:{marketingStatus:'unsubscribed',unsubscribedAt:new Date(),confirmationNonce:randomUUID(),consentAt:null}});
 await tx.user.updateMany({where:{email:{equals:lead.email,mode:'insensitive'}},data:{marketingOptOutAt:new Date()}});
 await tx.outboundEmail.updateMany({where:{recipient:{equals:lead.email,mode:'insensitive'},OR:[{type:{startsWith:'marketing_'}},{type:'crm_subscription_confirmation'}],status:'queued'},data:{status:'cancelled',lastError:reason}});
 await tx.crmCampaignRecipient.updateMany({where:{leadId:id,status:'queued'},data:{status:'cancelled',lastError:reason}});
 if(lead.marketingStatus!=='unsubscribed')await tx.crmActivity.create({data:{leadId:id,kind:'permission',body:reason}});return true;
}
export type ProviderReadiness={ready:boolean;provider:string;sender:string;checks:{label:string;ok:boolean;detail:string}[]};
let readinessCache:{until:number;value:ProviderReadiness}|null=null;
export async function marketingReadiness(force=false):Promise<ProviderReadiness>{
 if(!force&&readinessCache&&readinessCache.until>Date.now())return readinessCache.value;
 const sender=emailIdentity('marketing').from;const checks:ProviderReadiness['checks']=[];
 checks.push({label:'Mailbox activation',ok:process.env.EMAIL_AUTOMATION_READY==='true',detail:process.env.EMAIL_AUTOMATION_READY==='true'?'Mailboxes and delivery verified':'Complete mailbox, provider and delivery verification before activating.'});
 checks.push({label:'Sending provider',ok:!!process.env.BREVO_API_KEY,detail:process.env.BREVO_API_KEY?'Brevo configured':'Add a Brevo API key to the server environment.'});
 checks.push({label:'Queue authentication',ok:!!process.env.CRON_SECRET,detail:process.env.CRON_SECRET?'Protected worker configured':'Configure CRON_SECRET and the email-delivery scheduler.'});
 checks.push({label:'Preference links',ok:!!process.env.NEXTAUTH_SECRET,detail:process.env.NEXTAUTH_SECRET?'Signed unsubscribe links configured':'Server signing secret missing.'});
 if(process.env.BREVO_API_KEY){try{
 const headers={'api-key':process.env.BREVO_API_KEY};const account=await fetch('https://api.brevo.com/v3/account',{headers,signal:AbortSignal.timeout(8000),cache:'no-store'});
 const body=await account.json().catch(()=>({}));checks.push({label:'Provider account access',ok:account.ok,detail:account.ok?'Account accessible':body.code==='permission_denied'?'Brevo denied access. The account is blocked; resolve it in Brevo before sending.':`Provider access failed (HTTP ${account.status}).`});
 if(account.ok){const [s,w]=await Promise.all([fetch('https://api.brevo.com/v3/senders',{headers,signal:AbortSignal.timeout(8000),cache:'no-store'}),fetch('https://api.brevo.com/v3/webhooks?type=transactional',{headers,signal:AbortSignal.timeout(8000),cache:'no-store'})]);const senders=await s.json(),hooks=await w.json();const address=sender.match(/<([^>]+)>/)?.[1]||sender;const match=(senders.senders||[]).find((row:{id:number;email:string;active:boolean})=>row.email.toLowerCase()===address.toLowerCase());checks.push({label:'Verified sender',ok:s.ok&&!!match?.active,detail:match?.active?'Configured sender is active':'Verify the configured sender in Brevo.'});const events=['delivered','hardBounce','spam','unsubscribed'];const hook=(hooks.webhooks||[]).find((row:{url:string;events:string[]})=>row.url?.startsWith(`${process.env.NEXTAUTH_URL||'https://wazap.lt'}/api/email/brevo-webhook?`)&&events.every(e=>row.events.includes(e)));checks.push({label:'Delivery callbacks',ok:w.ok&&!!hook&&!!process.env.BREVO_WEBHOOK_SECRET,detail:hook?'Required delivery and suppression events are connected':'Connect delivered, hardBounce, spam and unsubscribed events to the protected Brevo webhook.'});}
 }catch{checks.push({label:'Provider connection',ok:false,detail:'Provider could not be reached. Retry the connection check.'});}}
 const value={ready:checks.every(c=>c.ok),provider:'Brevo',sender,checks};readinessCache={until:Date.now()+60000,value};return value;
}
