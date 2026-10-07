import {prisma} from './prisma';
import {marketingReadiness,preferenceUrl,renderCampaign} from './crm-marketing';
import type {CrmCampaignRecipient,CrmCampaign} from '@prisma/client';
export type CampaignSend=(row:CrmCampaignRecipient,campaign:CrmCampaign)=>Promise<{status:'sent'|'retry'|'failed'|'unknown';messageId?:string;error?:string}>;
export async function sendCampaignEmail(row:CrmCampaignRecipient,campaign:CrmCampaign){
 const link=preferenceUrl(row.leadId,row.email);const raw=process.env.EMAIL_FROM||'Wazap <hello@wazap.lt>';const match=raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);const senderId=Number(process.env.BREVO_SENDER_ID);const sender=senderId>0?{id:senderId}:match?{name:match[1],email:match[2]}:{name:'Wazap',email:raw};
 try{
 const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':process.env.BREVO_API_KEY!,'Content-Type':'application/json'},body:JSON.stringify({sender,to:[{email:row.email}],subject:campaign.subject,htmlContent:renderCampaign(campaign,link),headers:{'List-Unsubscribe':`<${link}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click','X-Mailin-custom':`crm-recipient:${row.id}`},tags:['wazap-crm',campaign.id]}),signal:AbortSignal.timeout(10000)});
 const body=await response.json().catch(()=>({}));if(response.ok&&body.messageId)return {status:'sent' as const,messageId:body.messageId};if(response.status===429)return {status:'retry' as const,error:'Provider rate limit. Retry scheduled.'};return {status:response.status>=500?'unknown' as const:'failed' as const,error:`Provider returned HTTP ${response.status}.`};
 }catch{return {status:'unknown' as const,error:'Provider outcome is uncertain. Reconcile provider logs before any resend.'};}
}
// Injection is available only to isolated tests. Production route always uses the real checks and sender.
export async function processCrmCampaigns(options?:{send?:CampaignSend;ready?:()=>Promise<boolean>}){
 if(options&& !new URL(process.env.DATABASE_URL||'').pathname.includes('wazap_crm_qa_'))throw new Error('Test injection is restricted to the isolated CRM database.');
 const ready=options?.ready?await options.ready():(await marketingReadiness()).ready;if(!ready)return {processed:0,blocked:true};
 await prisma.crmCampaignRecipient.updateMany({where:{status:'processing',claimedAt:{lt:new Date(Date.now()-300000)}},data:{status:'unknown',lastError:'Worker stopped during send. Verify provider logs before resending.'}});
 const rows=await prisma.crmCampaignRecipient.findMany({where:{status:'queued',nextAttemptAt:{lte:new Date()},attempts:{lt:5},campaign:{status:{in:['scheduled','sending']},scheduledAt:{lte:new Date()}}},orderBy:{nextAttemptAt:'asc'},take:10});let processed=0;
 for(const row of rows){
 const claim=await prisma.$transaction(async tx=>{const campaign=await tx.crmCampaign.findUnique({where:{id:row.campaignId}});if(!campaign||!['scheduled','sending'].includes(campaign.status))return null;const updated=await tx.crmCampaignRecipient.updateMany({where:{id:row.id,status:'queued'},data:{status:'processing',claimedAt:new Date(),attempts:{increment:1}}});if(!updated.count)return null;return campaign;});if(!claim)continue;
 const lead=await prisma.crmLead.findUnique({where:{id:row.leadId}});const optedOut=await prisma.user.findFirst({where:{email:{equals:row.email,mode:'insensitive'},marketingOptOutAt:{not:null}},select:{id:true}});const campaign=await prisma.crmCampaign.findUnique({where:{id:row.campaignId}});
 if(!lead||lead.email!==row.email||lead.marketingStatus!=='subscribed'||!lead.consentAt||lead.doNotContact||lead.emailSuppressedAt||optedOut||!campaign||!['scheduled','sending'].includes(campaign.status)){await prisma.crmCampaignRecipient.update({where:{id:row.id},data:{status:'cancelled',lastError:'Eligibility changed or campaign cancelled before send.'}});continue;}
 await prisma.crmCampaign.updateMany({where:{id:campaign.id,status:'scheduled'},data:{status:'sending'}});
 const result=await (options?.send||sendCampaignEmail)(row,campaign);
 // A callback can arrive before this response; never downgrade its delivered/suppressed result.
 await prisma.crmCampaignRecipient.updateMany({where:{id:row.id,status:'processing'},data:{status:result.status==='retry'?(row.attempts+1>=5?'failed':'queued'):result.status,providerMessageId:result.messageId||null,sentAt:result.status==='sent'?new Date():null,nextAttemptAt:new Date(Date.now()+Math.min(60,2**(row.attempts+1))*60000),lastError:result.error||null}});processed++;
 }
 const active=await prisma.crmCampaign.findMany({where:{status:{in:['scheduled','sending']}},select:{id:true}});for(const campaign of active){if(!await prisma.crmCampaignRecipient.count({where:{campaignId:campaign.id,status:{in:['queued','processing']}}}))await prisma.crmCampaign.updateMany({where:{id:campaign.id,status:{in:['scheduled','sending']}},data:{status:'completed',completedAt:new Date()}});}
 return {processed,blocked:false};
}
