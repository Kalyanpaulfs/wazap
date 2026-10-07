import {PrismaClient} from '@prisma/client';
process.loadEnvFile('.env');
const p=new PrismaClient();
const counts={signups:0,enquiries:0,chats:0,skippedInvalid:0};
const valid=email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
async function upsert(tx,{name,email,source,createdAt,lastActivityAt}){
 email=(email||'').trim().toLowerCase();if(!valid(email)){counts.skippedInvalid++;return null;}
 const current=await tx.crmLead.findUnique({where:{email}});
 if(!current)return tx.crmLead.create({data:{email,name:name||email,source,createdAt,lastActivityAt}});
 return tx.crmLead.update({where:{id:current.id},data:{...((current.name===current.email)&&name?{name}:{}),createdAt:current.createdAt<createdAt?current.createdAt:createdAt,lastActivityAt:current.lastActivityAt>lastActivityAt?current.lastActivityAt:lastActivityAt}});
}
try{
 for(const user of await p.user.findMany({where:{isAdmin:false},select:{id:true,name:true,email:true,createdAt:true},orderBy:{createdAt:'asc'}}))await p.$transaction(async tx=>{const lead=await upsert(tx,{...user,source:'signup',lastActivityAt:user.createdAt});if(!lead)return;await tx.crmActivity.upsert({where:{sourceKey:`signup:${user.id}`},create:{leadId:lead.id,kind:'signup',body:'Existing Wazap account linked to the CRM.',sourceKey:`signup:${user.id}`,createdAt:user.createdAt},update:{}});counts.signups++;});
 for(const message of await p.contactMessage.findMany({orderBy:{createdAt:'asc'}}))await p.$transaction(async tx=>{const lead=await upsert(tx,{...message,source:'contact_form',lastActivityAt:message.repliedAt||message.createdAt});if(!lead)return;await tx.crmActivity.upsert({where:{sourceKey:`contact:${message.id}`},create:{leadId:lead.id,kind:'enquiry',body:`${message.subject}: ${message.message}`,sourceKey:`contact:${message.id}`,createdAt:message.createdAt},update:{}});counts.enquiries++;});
 for(const conversation of await p.supportConversation.findMany({where:{email:{not:null}},orderBy:{createdAt:'asc'}}))await p.$transaction(async tx=>{const lead=await upsert(tx,{...conversation,source:'website_chat'});if(!lead)return;await tx.supportConversation.update({where:{id:conversation.id},data:{crmLeadId:lead.id}});await tx.crmActivity.upsert({where:{sourceKey:`chat-import:${conversation.id}`},create:{leadId:lead.id,kind:'capture',body:'Existing website chat linked to the CRM. Phone number has not been collected yet.',sourceKey:`chat-import:${conversation.id}`,createdAt:conversation.createdAt},update:{}});counts.chats++;});
 console.log(JSON.stringify({ok:true,...counts,crmContacts:await p.crmLead.count()}));
}finally{await p.$disconnect();}
