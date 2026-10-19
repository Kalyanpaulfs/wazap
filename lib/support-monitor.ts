import {activeCrmContacts,CRM_TRASH_TAG} from "./crm-trash";
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { chatResponseState, responseState, SUPPORT_REPLY_TARGET_MINUTES } from './support-queue';
import { queueSupportAlert } from './support-notify';
import { buildSupportDigest, supportDigestSlot, type WaitingItem } from './support-digest';
import { pollZohoInboxes } from './zoho-inbox';
const stateFile=()=>process.env.WAZAP_SUPPORT_MONITOR_STATE || '/opt/wazap-private/support-monitor.json';
export async function supportMonitorHealth(){try{return JSON.parse(await readFile(/* turbopackIgnore: true */ stateFile(),'utf8'));}catch{return null;}}
export async function monitorSupport({poll=process.env.SUPPORT_INBOX_POLLING!=="disabled",now=new Date()}={}) {
 const inboxes=poll?(await pollZohoInboxes()).results:[];
 const since=new Date(process.env.SUPPORT_MONITOR_SINCE || now.toISOString());
 const chats=await prisma.supportConversation.findMany({where:{status:{not:'closed'},OR:[{crmLeadId:null},{crmLead:activeCrmContacts}]},include:{messages:{orderBy:{createdAt:'asc'}}}});
 const trashed=await prisma.crmLead.findMany({where:{tags:{has:CRM_TRASH_TAG}},select:{email:true}});
 const tickets=await prisma.contactMessage.findMany({where:{adminReply:null,NOT:{OR:trashed.map(lead=>({email:{equals:lead.email,mode:'insensitive' as const}}))}}});
 const qa=await prisma.crmActivity.findMany({where:{sourceKey:{startsWith:"support-qa:"},body:"true"},select:{sourceKey:true}});
 const qaIds=new Set(qa.map(x=>x.sourceKey!.slice("support-qa:".length)));
 let overdue=0;const waiting:WaitingItem[]=[];
 for(const chat of chats){
  for(const m of chat.messages.filter(m=>m.sender==='visitor'&&m.createdAt>=since))await queueSupportAlert({eventKey:'chat:'+m.id,name:chat.name,email:chat.email,subject:'Wazap live support: new customer message',message:m.body,link:`https://wazap.lt/admin/crm/support?chat=${encodeURIComponent(chat.id)}`});
  const state=chatResponseState(chat,now);if(!state.overdue)continue;overdue++;
  waiting.push({kind:'chat',name:chat.name,email:chat.email,waitingSince:state.waitingSince!});
 }
 for(const ticket of tickets){
  if(qaIds.has(ticket.id))continue;
  if(ticket.createdAt>=since)await queueSupportAlert({eventKey:'request:'+ticket.id,name:ticket.name,email:ticket.email,subject:'New Wazap support request: '+ticket.subject,message:ticket.message});
  const state=responseState(ticket.createdAt,now);if(!state.overdue)continue;overdue++;
  waiting.push({kind:'request',name:ticket.name,email:ticket.email,topic:ticket.subject,waitingSince:state.waitingSince!});
  await prisma.crmTask.updateMany({where:{completedAt:null,title:{endsWith:'review request '+ticket.id}},data:{dueAt:new Date(state.dueAt!)}});
 }
 const [deliveryFailures,queuedService]=await Promise.all([
  prisma.outboundEmail.count({where:{status:{in:['failed','unknown','deferred']},createdAt:{gte:since},NOT:{OR:[{type:{startsWith:'marketing_'}},{type:{startsWith:'crm_'}}]}}}),
  prisma.outboundEmail.count({where:{status:{in:['queued','processing']},NOT:{OR:[{type:{startsWith:'marketing_'}},{type:{startsWith:'crm_'}}]}}}),
 ]);
 const mailboxErrors=inboxes.filter(m=>!m.connected||m.error);
 // Waiting items and inbox/delivery problems go out as ONE summary email a
 // day (first run after 09:00 Dubai), never hourly per item.
 const slot=supportDigestSlot(now);
 if(slot.due){
  const failedToday=await prisma.outboundEmail.count({where:{status:{in:['failed','unknown','deferred']},createdAt:{gte:new Date(now.getTime()-86400000)},NOT:{OR:[{type:{startsWith:'marketing_'}},{type:{startsWith:'crm_'}}]}}});
  const digest=buildSupportDigest({waiting,mailboxProblems:mailboxErrors.map(m=>m.mailbox),deliveryFailures:failedToday,now});
  if(digest)await queueSupportAlert({eventKey:`support-digest:${slot.day}`,subject:digest.subject,message:digest.message});
 }
 const health={checkedAt:now.toISOString(),targetMinutes:SUPPORT_REPLY_TARGET_MINUTES,overdue,mailboxes:inboxes.map(m=>({mailbox:m.mailbox,connected:m.connected,ok:m.connected&&!m.error})),deliveryFailures,queuedService};
 await mkdir(stateFile().slice(0,stateFile().lastIndexOf('/')),{recursive:true,mode:0o700});
 const temp=stateFile()+'.'+randomUUID();await writeFile(temp,JSON.stringify(health),{mode:0o600});await rename(temp,stateFile());return health;
}
