import {outboundMessageId} from "@/lib/support-threading";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { emailChannel } from '@/lib/email-brand';
import { processCrmCampaigns } from '@/lib/crm-campaign-worker';
import { nurtureEligibility, reactivationEligible } from '@/lib/customer-nurture';
import { preferenceUrl } from '@/lib/crm-marketing';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(req:Request){
 if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!isEmailConfigured())return NextResponse.json({accepted:0,queued:await prisma.outboundEmail.count({where:{status:'queued'}}),provider:'not_configured'});
 await prisma.outboundEmail.updateMany({where:{status:'processing',updatedAt:{lt:new Date(Date.now()-10*60000)}},data:{status:'unknown',lastError:'Worker interrupted during send; reconcile provider before resending.'}});
 const marketingOnly={OR:[{AND:[{type:{startsWith:'marketing_'}},{NOT:{type:{startsWith:'marketing_service_'}}}]},{type:{startsWith:'crm_'}}]};
 const serviceOnly={NOT:marketingOnly};
 const daily=await prisma.outboundEmail.count({where:{...marketingOnly,sentAt:{gte:new Date(Date.now()-86400000)},status:{in:['accepted','sent','delivered','deferred']}}});
 const due={status:'queued',nextAttemptAt:{lte:new Date()},attempts:{lt:8}};
 const serviceMessages=await prisma.outboundEmail.findMany({where:{...due,...serviceOnly},orderBy:{createdAt:'asc'},take:20});
 const marketingMessages=await prisma.outboundEmail.findMany({where:{...due,...marketingOnly},orderBy:{createdAt:'asc'},take:Math.min(20-serviceMessages.length,Math.max(0,250-daily))});
 const messages=[...serviceMessages,...marketingMessages];
 let accepted=0;
 for(const message of messages){
  const headers:Record<string,string>={'Message-ID':outboundMessageId(message.id),'X-Mailin-custom':`outbound-email:${message.id}`,'Auto-Submitted':'auto-replied','X-Auto-Response-Suppress':'All'};
  const thread=await prisma.crmActivity.findUnique({where:{sourceKey:'inbound-email-reply:'+message.id},select:{body:true}});if(thread&&/^<[^\r\n<>]{1,900}>$/.test(thread.body)){headers['In-Reply-To']=thread.body;headers.References=thread.body;}
  if(message.type.startsWith('marketing_')&&!message.type.startsWith('marketing_service_')){const check=await nurtureEligibility(message.recipient,message.userId,message.type==='marketing_nurture_feedback');if(!check.ok||(message.type==='marketing_nurture_reactivation'&&(!check.user||!reactivationEligible(check.user)))){await prisma.outboundEmail.updateMany({where:{id:message.id,status:'queued'},data:{status:'cancelled',lastError:check.reason||'Paid access renewed; reactivation held'}});continue;}if(check.lead){headers['List-Unsubscribe']=`<${preferenceUrl(check.lead.id,message.recipient)}>`;headers['List-Unsubscribe-Post']='List-Unsubscribe=One-Click';}}
  const lead=await prisma.crmLead.findFirst({where:{email:{equals:message.recipient,mode:'insensitive'},emailSuppressedAt:{not:null}},select:{id:true}});
  if(lead){await prisma.outboundEmail.updateMany({where:{id:message.id,status:'queued'},data:{status:'held',lastError:'Address suppressed by provider; investigate before sending.'}});continue;}
  const claim=await prisma.outboundEmail.updateMany({where:{id:message.id,status:'queued'},data:{status:'processing',attempts:{increment:1}}});if(!claim.count)continue;
  const result=await sendEmail({to:message.recipient,subject:message.subject,html:message.html,channel:emailChannel(message.type),headers});
  const attempts=message.attempts+1;
  await prisma.outboundEmail.updateMany({where:{id:message.id,status:'processing'},data:result.accepted?{status:'accepted',sentAt:new Date(),attempts,lastError:null,provider:result.provider,providerMessageId:result.messageId||null}:{status:result.uncertain?'unknown':attempts>=8?'failed':'queued',attempts,nextAttemptAt:new Date(Date.now()+(message.type.includes('support')||message.type.includes('billing')||message.type==='password_reset'?Math.min(30,2**attempts)*60000:Math.min(24,2**attempts)*3600000)),lastError:result.error||'Provider request failed'}});
  if(result.accepted)accepted++;
 }
 const campaigns=daily+accepted<240?await processCrmCampaigns():{processed:0,blocked:true};
 return NextResponse.json({accepted,attempted:messages.length,campaigns});
}
