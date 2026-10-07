import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
process.loadEnvFile('.env');
if(!new URL(process.env.DATABASE_URL).pathname.includes('wazap_crm_qa_'))throw new Error('CRM QA must use its isolated database.');
const p=new PrismaClient();const base='http://127.0.0.1:5011';const checks=[];
async function call(path,{method='GET',body,cookie}={}){const res=await fetch(base+path,{method,redirect:'manual',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),Origin:process.env.NEXTAUTH_URL||base},body:body?JSON.stringify(body):undefined});const json=await res.json().catch(()=>({}));return {status:res.status,json,res};}
function check(label,value){assert.ok(value,label);checks.push(label);}
async function login(email){let cookies=[];const csrf=await call('/api/auth/csrf');cookies.push(...csrf.res.headers.getSetCookie().map(c=>c.split(';')[0]));const response=await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:cookies.join('; '),Origin:process.env.NEXTAUTH_URL||base},body:new URLSearchParams({csrfToken:csrf.json.csrfToken,email,password:'QaOnlyPassword2026!',json:'true',callbackUrl:base+'/dashboard'})});cookies.push(...response.headers.getSetCookie().map(c=>c.split(';')[0]));return cookies.join('; ');}
try{
 const hashed=await bcrypt.hash('QaOnlyPassword2026!',10);
 for(const [email,isAdmin] of [['qa-admin@example.invalid',true],['qa-user@example.invalid',false]])await p.user.upsert({where:{email},create:{email,name:isAdmin?'QA administrator':'QA customer',password:hashed,isAdmin},update:{password:hashed,isAdmin}});
 const visitorId=randomUUID();const chatEmail=`capture-${visitorId}@example.invalid`;
 check('CRM API denies anonymous requests',(await call('/api/admin/crm')).status===403);
 check('AI endpoint rejects missing contact',(await call('/api/chatbot',{method:'POST',body:{visitorId,message:'Rotator'}})).status===422);
 check('Human endpoint rejects missing contact',(await call('/api/support/chat',{method:'POST',body:{visitorId,message:'QA'}})).status===422);
 check('Incomplete profile rejected',(await call('/api/support/profile',{method:'POST',body:{visitorId,name:'QA visitor',email:chatEmail}})).status===400);
 check('Invalid phone rejected',(await call('/api/support/profile',{method:'POST',body:{visitorId,name:'QA visitor',email:chatEmail,phone:'not-a-number'}})).status===400);
 check('Profile saved',(await call('/api/support/profile',{method:'POST',body:{visitorId,name:'QA Visitor',email:chatEmail,phone:'+971 50 123 4567'}})).status===201);
 const thread=await p.supportConversation.findUnique({where:{visitorId}});check('Profile linked to CRM and normalized phone',thread.crmLeadId&&thread.phone==='+971501234567');
 const secondVisitor=randomUUID();await call('/api/support/profile',{method:'POST',body:{visitorId:secondVisitor,name:'QA visitor repeated',email:chatEmail.toUpperCase(),phone:'+971501234567'}});check('Repeated email deduplicates contacts',await p.crmLead.count({where:{email:chatEmail}})===1);
 check('AI response succeeds with captured profile',(await call('/api/chatbot',{method:'POST',body:{visitorId,message:'Rotator QA verification'}})).status===200);
 check('AI history survives reload API',(await call(`/api/support/chat?visitorId=${visitorId}`)).json.conversation.messages.length===2);
 check('Human request succeeds with profile',(await call('/api/support/chat',{method:'POST',body:{visitorId,message:'Isolated live support QA'}})).status===200);
 const cookie=await login('qa-admin@example.invalid');const userCookie=await login('qa-user@example.invalid');
 check('CRM denies non-admin account',(await call('/api/admin/crm',{cookie:userCookie})).status===403);
 const list=await call('/api/admin/crm',{cookie});check('CRM admin list succeeds',list.status===200&&list.json.leads.some(lead=>lead.id===thread.crmLeadId));
 let record=(await call(`/api/admin/crm?id=${thread.crmLeadId}`,{cookie})).json.lead;
 const fields={id:record.id,updatedAt:record.updatedAt,name:record.name,email:record.email,phone:record.phone,company:'QA Company',stage:'qualified',ownerId:list.json.owners[0].id,value:99,currency:'USD',doNotContact:false};
 check('Pipeline, owner and value persist',(await call('/api/admin/crm',{method:'PATCH',body:fields,cookie})).status===200);
 check('Stale edits rejected',(await call('/api/admin/crm',{method:'PATCH',body:fields,cookie})).status===409);
 check('Internal note saves',(await call('/api/admin/crm',{method:'POST',cookie,body:{action:'note',leadId:record.id,note:'Isolated CRM QA note'}})).status===200);
 check('Follow-up saves',(await call('/api/admin/crm',{method:'POST',cookie,body:{action:'task',leadId:record.id,title:'QA follow-up',dueAt:new Date(Date.now()-60000).toISOString()}})).status===200);
 check('Due queue finds contact',(await call('/api/admin/crm?due=1',{cookie})).json.leads.some(lead=>lead.id===record.id));
 record=(await call(`/api/admin/crm?id=${record.id}`,{cookie})).json.lead;
 check('Task completion persists',(await call('/api/admin/crm',{method:'POST',cookie,body:{action:'completeTask',leadId:record.id,taskId:record.tasks[0].id}})).status===200);
 check('Task cannot be completed for another contact',(await call('/api/admin/crm',{method:'POST',cookie,body:{action:'completeTask',leadId:record.id,taskId:'unrelated-task'}})).status===409);
 check('Cross-origin writes rejected',(await fetch(base+'/api/support/profile',{method:'POST',headers:{Origin:'https://other.invalid','Content-Type':'application/json'},body:JSON.stringify({visitorId})})).status===403);
 const signupEmail=`signup-${randomUUID()}@example.invalid`;
 check('Signup still succeeds',(await call('/api/auth/signup',{method:'POST',body:{name:'QA Signup',email:signupEmail,password:'QaOnlyPassword2026!'}})).status===200);
 check('Signup enters CRM',Boolean(await p.crmLead.findUnique({where:{email:signupEmail}})));
 check('Contact form still succeeds',(await call('/api/contact',{method:'POST',body:{name:'QA Contact',email:'qa-contact@example.invalid',subject:'general',message:'Isolated contact enquiry QA'}})).status===201);
 check('Contact enquiry enters CRM',Boolean(await p.crmLead.findUnique({where:{email:'qa-contact@example.invalid'}})));
 console.log(JSON.stringify({ok:true,passed:checks.length,checks}));
}finally{await p.$disconnect();}
