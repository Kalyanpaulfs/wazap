import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire('/opt/wazap/package.json');
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
const root='/opt/wazap-support-worker';const visitors=[];const results=[];
async function post(path,data){const response=await fetch('https://wazap.lt'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://wazap.lt','User-Agent':'Mozilla/5.0 WazapSupportQA/1.0'},body:JSON.stringify(data),signal:AbortSignal.timeout(70000)});const value=await response.json();if(!response.ok)throw Error('HTTP_'+response.status);return value;}
async function profile(){const id=randomUUID();const email='codex-qa-'+id+'@example.invalid';visitors.push({id,email});await post('/api/support/profile',{visitorId:id,name:'Wazap internal support QA',email,phone:'+447700900000',newsletter:false});return id;}
try{
 const id=await profile();
 let result=await post('/api/chatbot',{visitorId:id,message:'How do I add a WhatsApp button to my website?'});
 if(!result.aiAvailable||result.supportRequest||!result.reply.includes('/tools/widget'))throw Error('english_reply_failed');results.push({id:'public_english',passed:true});
 result=await post('/api/chatbot',{visitorId:id,message:'Where do I open that tool?'});
 if(!result.aiAvailable||!result.reply.includes('/tools/widget'))throw Error('context_failed');results.push({id:'public_context',passed:true});
 const conversation=await db.supportConversation.findUniqueOrThrow({where:{visitorId:id},include:{messages:true,crmLead:true}});
 if(conversation.status!=='ai'||conversation.messages.length!==4||!conversation.crmLead||!conversation.contactCapturedAt)throw Error('persistence_failed');results.push({id:'crm_history',passed:true});
 result=await post('/api/chatbot',{visitorId:id,message:'Je veux parler à Joseph, un humain, maintenant.'});
 if(!result.aiAvailable||!result.supportRequest||result.language!=='fr'||result.conversationId!==conversation.id)throw Error('handoff_failed');
 const handoff=await db.supportConversation.findUniqueOrThrow({where:{visitorId:id},include:{messages:true}});if(handoff.status!=='open'||handoff.messages.length!==6)throw Error('handoff_persistence_failed');results.push({id:'human_handoff',passed:true});
 const outageId=await profile();execFileSync('systemctl',['stop','wazap-support-worker']);
 try{result=await post('/api/chatbot',{visitorId:outageId,message:'كيف أنشئ زر واتساب؟'});if(result.aiAvailable||!result.supportRequest||!/[\u0600-\u06ff]/.test(result.reply))throw Error('outage_failed');const outage=await db.supportConversation.findUniqueOrThrow({where:{visitorId:outageId},include:{messages:true}});if(outage.status!=='open'||outage.messages.length!==2)throw Error('outage_persistence_failed');results.push({id:'outage_fallback_arabic',passed:true});}finally{execFileSync('systemctl',['start','wazap-support-worker']);}
}finally{
 for(const visitor of visitors){const thread=await db.supportConversation.findUnique({where:{visitorId:visitor.id},select:{id:true,crmLeadId:true}});const lead=await db.crmLead.findUnique({where:{email:visitor.email}});if(lead&&lead.email===visitor.email&&lead.name==='Wazap internal support QA'){await db.$transaction(async tx=>{if(thread)await tx.supportConversation.delete({where:{id:thread.id}});await tx.crmActivity.deleteMany({where:{leadId:lead.id}});await tx.crmLead.delete({where:{id:lead.id}});});}}
 await db.$disconnect();fs.writeFileSync(root+'/live-verification.json',JSON.stringify({date:new Date().toISOString(),results,syntheticFixturesRemoved:true},null,2),{mode:0o600});console.log(JSON.stringify({results,syntheticFixturesRemoved:true}));
}
