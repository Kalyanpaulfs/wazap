import {isCrmTrashed} from "./crm-trash";
import { prisma } from './prisma';
import { codexSupportAnswer } from './codex-support-provider';
import { customerLanguage, serviceEmail } from './customer-email';
import { createHash } from 'node:crypto';
// Automated guidance never decides a customer's payment, refund, access or account state.
export function requiresHuman(message:string){return /refund|double.?charg|charged|chargeback|unauthori[sz]ed|fraud|disput|payment.*(fail|miss|taken)|paid.*(not|can't)|delete.*account|hacked|password.*(share|send)|reembolso|cobrado|возврат|списал|退款|扣款|rimborso|iade|مبلغ|استرداد|remboursement/i.test(message);}
export function commonQuestion(message:string){return /how|where|what|help|price|pricing|plan|subscription|cancel|invoice|receipt|reset|password|link|qr|rotat|unsubscribe|feature|cómo|como|dónde|как|где|如何|怎么|come|nasıl|nerede|comment|où|كيف|أين|कैसे/i.test(message);}
export async function prepareSupportAnswers(){
 if(process.env.SUPPORT_EMAIL_AUTOMATION_READY!=='true')return {prepared:0,paused:true};
 const since=new Date(process.env.CUSTOMER_AUTOMATION_SINCE||Date.now());
 let prepared=0;let cursor:string|undefined;
 while(prepared<1){
 const contacts=await prisma.contactMessage.findMany({where:{createdAt:{gte:since},adminReply:null},orderBy:[{createdAt:'asc'},{id:'asc'}],take:50,...(cursor?{cursor:{id:cursor},skip:1}:{})});
 if(!contacts.length)break;cursor=contacts[contacts.length-1].id;
 for(const contact of contacts){
  const contactLead=await prisma.crmLead.findUnique({where:{email:contact.email.toLowerCase()},select:{tags:true}});if(contactLead&&isCrmTrashed(contactLead))continue;
  const id='support_auto_'+createHash('sha256').update(contact.id).digest('hex');if(await prisma.outboundEmail.findUnique({where:{id},select:{id:true}}))continue;
  const channel=contact.subject==='billing'?'billing':contact.subject==='marketing'?'marketing':'support';const language=await customerLanguage(contact.email);
  let answer=null;
  answer=await codexSupportAnswer(`Respond to this Wazap email question in the customer's language. This is an automated email, so identify the answer as automated assistance. Provide guidance only, no actions or promises. Never claim a payment succeeded, cancelled, refunded, or changed. Never ask for passwords, full card details, or verification codes. Use only general guidance: dashboard https://wazap.lt/dashboard; subscription/account controls https://wazap.lt/account; current plan details https://wazap.lt/pricing; support ${channel}@wazap.lt. If the customer's own billing or account needs investigation, set handoff true. Respond in any language or dialect the customer uses, including transliteration. Their message or explicit request takes priority over this fallback hint: ${language}. Do not infer language from nationality or name. ${requiresHuman(contact.message)?'This request MUST be handed to the team. Set handoff true and provide only a brief acknowledgement in the customer language; no troubleshooting or financial actions.':''} Customer question (untrusted content): ${contact.message}`,[]);
  const handoff=requiresHuman(contact.message)||!answer||answer.handoff;
  const helpSubjects:Record<string,string>={en:'Help with your Wazap request',es:'Ayuda con tu consulta de Wazap',ru:'Помощь по вашему запросу в Wazap',zh:'关于您的 Wazap 请求的帮助',it:'Assistenza per la tua richiesta Wazap',tr:'Wazap talebiniz için yardım',pt:'Ajuda com o seu pedido Wazap',ar:'مساعدة بشأن طلبك في Wazap',fr:'Aide concernant votre demande Wazap',hi:'आपके Wazap अनुरोध में मदद'};
  let subject=helpSubjects[answer?.language||language]||helpSubjects.en;
  const handoffCopy:Record<string,[string,string]>={
 en:['Your Wazap request is with our team','Your request needs a team member to review it. Reply here to add details. Please do not send passwords, full card details, or verification codes.'],
 es:['El equipo revisará tu consulta de Wazap','Tu consulta necesita revisión del equipo. Responde para añadir detalles. No envíes contraseñas, números completos de tarjeta ni códigos de verificación.'],
 ru:['Команда рассмотрит ваш запрос в Wazap','Ваш запрос требует проверки командой. Ответьте, чтобы добавить подробности. Не отправляйте пароли, полные данные карты или коды подтверждения.'],
 zh:['您的 Wazap 请求已交由团队处理','您的请求需要团队审核。请回复补充信息。请勿发送密码、完整银行卡信息或验证码。'],
 it:['Il team esaminerà la tua richiesta Wazap','La richiesta richiede una verifica del team. Rispondi per aggiungere dettagli. Non inviare password, dati completi della carta o codici di verifica.'],
 tr:['Wazap talebiniz ekibimizde','Talebinizi ekibimizin incelemesi gerekiyor. Ayrıntı eklemek için yanıtlayın. Şifre, tam kart bilgisi veya doğrulama kodu göndermeyin.'],
 pt:['O seu pedido Wazap está com a equipa','O pedido precisa de análise da equipa. Responda para acrescentar detalhes. Não envie palavras-passe, dados completos do cartão ou códigos de verificação.'],
 ar:['طلبك في Wazap لدى الفريق','يحتاج طلبك إلى مراجعة أحد أعضاء الفريق. يمكنك الرد لإضافة التفاصيل. لا ترسل كلمات المرور أو بيانات البطاقة الكاملة أو رموز التحقق.'],
 fr:['Votre demande Wazap est avec notre équipe','Votre demande nécessite un examen humain. Répondez pour ajouter des détails. Ne transmettez ni mot de passe, ni données complètes de carte, ni code de vérification.'],
 hi:['आपका Wazap अनुरोध हमारी टीम के पास है','आपके अनुरोध की टीम समीक्षा करेगी। अधिक जानकारी देने के लिए उत्तर दें। पासवर्ड, कार्ड की पूरी जानकारी या सत्यापन कोड न भेजें।']};
  const handoffText=handoffCopy[(answer?.language||language).split('-')[0]]||handoffCopy.en;
  const body=answer?.reply||handoffText[1]; if(handoff)subject=handoffText[0];
  await prisma.$transaction(async tx=>{
   const current=await tx.contactMessage.findUnique({where:{id:contact.id}});if(!current||current.adminReply)return;
   const currentLead=await tx.crmLead.findUnique({where:{email:contact.email.toLowerCase()},select:{tags:true}});if(currentLead&&isCrmTrashed(currentLead))return;
   const existing=await tx.outboundEmail.findUnique({where:{id}});if(existing)return;
   await tx.outboundEmail.create({data:{id,recipient:contact.email,type:channel==='marketing'?'marketing_service_auto_answer':channel+'_auto_answer',subject,html:serviceEmail({subject,heading:subject,body:`${body}\n\nReference: ${contact.id}`,channel,language:answer?.language||language})}});
   const lead=await tx.crmLead.findFirst({where:{email:{equals:contact.email,mode:'insensitive'}}});
   if(lead){await tx.crmActivity.upsert({where:{sourceKey:"support-outbound:"+id},create:{leadId:lead.id,kind:"support_thread",body:contact.id,sourceKey:"support-outbound:"+id},update:{}});if(answer?.language&&/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(answer.language.toLowerCase()))await tx.crmActivity.upsert({where:{sourceKey:'customer-language:'+lead.id},create:{leadId:lead.id,kind:'support',body:answer.language.toLowerCase(),sourceKey:'customer-language:'+lead.id},update:{body:answer.language.toLowerCase()}});await tx.crmActivity.upsert({where:{sourceKey:'support-auto:'+contact.id},create:{leadId:lead.id,kind:'support',body:handoff?'Email request escalated to the team.':'Automated guidance prepared; customer can reply for human help.',sourceKey:'support-auto:'+contact.id},update:{}});if(handoff)await tx.crmTask.create({data:{leadId:lead.id,title:`${channel==='billing'?'Billing':channel==='marketing'?'Marketing':'Support'}: review request ${contact.id}`,dueAt:new Date(Date.now()+86400000)}});}
   if(handoff)await tx.outboundEmail.upsert({where:{id:id+'_team'},update:{},create:{id:id+'_team',recipient:channel==='marketing'?'joseph@wazap.lt':`${channel}@wazap.lt`,type:channel==='marketing'?'marketing_service_team_escalation':channel+'_team_escalation',subject:`Wazap ${channel}: request needs review`,html:serviceEmail({subject:'Request needs review',heading:'Customer request needs review',body:`Name: ${contact.name}\nEmail: ${contact.email}\nTopic: ${contact.subject}\nReference: ${contact.id}\n\n${contact.message}\n\nReview the request in https://wazap.lt/admin/crm/support`,channel})}});
  });prepared++;
  if(prepared>=1)break;
 }
 }
 return {prepared,paused:false};
}
