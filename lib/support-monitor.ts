import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { chatResponseState, responseState, SUPPORT_REPLY_TARGET_MINUTES } from './support-queue';
import { queueSupportAlert } from './support-notify';
import { pollZohoInboxes } from './zoho-inbox';
const stateFile=()=>process.env.WAZAP_SUPPORT_MONITOR_STATE || '/opt/wazap-private/support-monitor.json';
export async function supportMonitorHealth(){try{return JSON.parse(await readFile(/* turbopackIgnore: true */ stateFile(),'utf8'));}catch{return null;}}
export async function monitorSupport({poll=process.env.SUPPORT_INBOX_POLLING!=="disabled",now=new Date()}={}) {
 const inboxes=poll?(await pollZohoInboxes()).results:[];
 const since=new Date(process.env.SUPPORT_MONITOR_SINCE || now.toISOString());
 const chats=await prisma.supportConversation.findMany({where:{status:{not:'closed'}},include:{messages:{orderBy:{createdAt:'asc'}}}});
 const tickets=await prisma.contactMessage.findMany({where:{adminReply:null}});
 let overdue=0;
 for(const chat of chats){
  for(const m of chat.messages.filter(m=>m.sender==='visitor'&&m.createdAt>=since))await queueSupportAlert({eventKey:'chat:'+m.id,name:chat.name,email:chat.email,subject:'Wazap live support: new customer message',message:m.body,link:`https://wazap.lt/admin/crm/support?chat=${encodeURIComponent(chat.id)}`});
  const state=chatResponseState(chat,now);if(!state.overdue)continue;overdue++;
  const bucket=Math.floor((now.getTime()-new Date(state.dueAt!).getTime())/3600000);
  await queueSupportAlert({eventKey:`overdue:chat:${chat.id}:${state.waitingSince}:${bucket}`,name:chat.name,email:chat.email,subject:'Wazap support: 30-minute reply target exceeded',message:'A customer is still waiting for a human reply. Reading the chat does not resolve this request.',link:`https://wazap.lt/admin/crm/support?chat=${encodeURIComponent(chat.id)}`});
 }
 for(const ticket of tickets){
  if(ticket.createdAt>=since)await queueSupportAlert({eventKey:'request:'+ticket.id,name:ticket.name,email:ticket.email,subject:'New Wazap support request: '+ticket.subject,message:ticket.message});
  const state=responseState(ticket.createdAt,now);if(!state.overdue)continue;overdue++;
  const bucket=Math.floor((now.getTime()-new Date(state.dueAt!).getTime())/3600000);
  await queueSupportAlert({eventKey:`overdue:request:${ticket.id}:${state.waitingSince}:${bucket}`,name:ticket.name,email:ticket.email,subject:'Wazap support: 30-minute reply target exceeded',message:`Request ${ticket.id} is still waiting for a human reply. Topic: ${ticket.subject}`});
  await prisma.crmTask.updateMany({where:{completedAt:null,title:{endsWith:'review request '+ticket.id}},data:{dueAt:new Date(state.dueAt!)}});
 }
 const [deliveryFailures,queuedService]=await Promise.all([
  prisma.outboundEmail.count({where:{status:{in:['failed','unknown','deferred']},createdAt:{gte:since},NOT:{OR:[{type:{startsWith:'marketing_'}},{type:{startsWith:'crm_'}}]}}}),
  prisma.outboundEmail.count({where:{status:{in:['queued','processing']},NOT:{OR:[{type:{startsWith:'marketing_'}},{type:{startsWith:'crm_'}}]}}}),
 ]);
 const mailboxErrors=inboxes.filter(m=>!m.connected||m.error);
 if(mailboxErrors.length||deliveryFailures)await queueSupportAlert({eventKey:`support-health:${now.toISOString().slice(0,13)}:${mailboxErrors.map(m=>m.mailbox).join(',')}:${deliveryFailures}`,subject:'Wazap support: inbox or delivery needs attention',message:`Mailbox problems: ${mailboxErrors.map(m=>m.mailbox).join(', ')||'none'}. Service emails needing review: ${deliveryFailures}. Check the support inbox and delivery logs.`});
 const health={checkedAt:now.toISOString(),targetMinutes:SUPPORT_REPLY_TARGET_MINUTES,overdue,mailboxes:inboxes.map(m=>({mailbox:m.mailbox,connected:m.connected,ok:m.connected&&!m.error})),deliveryFailures,queuedService};
 await mkdir(stateFile().slice(0,stateFile().lastIndexOf('/')),{recursive:true,mode:0o700});
 const temp=stateFile()+'.'+randomUUID();await writeFile(temp,JSON.stringify(health),{mode:0o600});await rename(temp,stateFile());return health;
}
