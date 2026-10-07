import { emailArtwork } from './email-artwork';
import { prisma } from './prisma';
import { emailSignature, type EmailChannel } from './email-brand';
import { htmlEscape } from './crm-marketing';
export async function customerLanguage(email:string) {
 const lead=await prisma.crmLead.findFirst({where:{email:{equals:email,mode:'insensitive'}},select:{id:true}});
 const preference=lead?await prisma.crmActivity.findUnique({where:{sourceKey:'customer-language:'+lead.id},select:{body:true}}):null;
 if(preference&&/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(preference.body))return preference.body;
 const user=await prisma.user.findFirst({where:{email:{equals:email,mode:'insensitive'}},select:{id:true}});
 const visit=user?await prisma.siteVisit.findFirst({where:{userId:user.id},orderBy:{createdAt:'desc'},select:{language:true}}):null;
 const language=(visit?.language||'en').toLowerCase().split(/[-_]/)[0];
 return /^[a-z]{2,3}$/.test(language)?language:'en';
}
export function serviceEmail(opts:{subject:string;heading:string;body:string;channel:EmailChannel;language?:string}) {
 const hint=(opts.language||'en').toLowerCase();const language=/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(hint)?hint:'en';const rtl=['ar','he','fa','ur','ps','dv','yi'].includes(language.split('-')[0]);
 return `<!doctype html><html lang="${language}" dir="${rtl?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f3ed;font:16px/1.8 Arial,sans-serif"><table role="presentation" width="100%"><tr><td style="padding:28px 12px"><table role="presentation" width="100%" style="max-width:600px;margin:auto;background:white;border-collapse:collapse"><tr><td style="padding:22px 32px;background:#0b2016;border-bottom:2px solid #25d366;color:#25d366;font-size:23px;font-weight:bold">Wazap</td></tr><tr><td>${emailArtwork(opts.channel,language)}</td></tr><tr><td style="padding:36px 32px;color:#435149"><h1 style="font:400 30px/1.25 Georgia,serif;color:#14281d;margin:0 0 24px">${htmlEscape(opts.heading)}</h1>${opts.body.split(/\n\s*\n/).map(p=>`<p style="margin:0 0 20px">${htmlEscape(p).replace(/\n/g,'<br>')}</p>`).join('')}</td></tr><tr><td>${emailSignature(opts.channel)}</td></tr><tr><td style="padding:18px 32px;font-size:11px;color:#6b746c;background:#f5f3ed">Wazap<br><a href="https://wazap.lt/privacy" style="color:#315f43">Privacy</a></td></tr></table></td></tr></table></body></html>`;
}
const acknowledgements:Record<string,[string,string]>={
 en:['We received your Wazap request','Your request is saved. Our automated assistant can help with common questions; the team will review anything that needs a person. Reply to this email to add details.'],
 es:['Hemos recibido tu consulta a Wazap','Tu consulta está guardada. Nuestro asistente automático puede ayudarte con preguntas frecuentes; el equipo revisará lo que necesite atención personal. Responde a este correo para añadir detalles.'],
 ru:['Мы получили ваш запрос в Wazap','Ваш запрос сохранён. Автоматический помощник ответит на типовые вопросы, а команда рассмотрит всё, что требует участия человека. Ответьте на это письмо, чтобы добавить подробности.'],
 zh:['我们已收到您的 Wazap 请求','您的请求已保存。自动助手可以回答常见问题；需要人工处理的事项将交由团队审核。您可以回复此邮件补充信息。'],
 it:['Abbiamo ricevuto la tua richiesta a Wazap','La tua richiesta è stata salvata. Il nostro assistente automatico può rispondere alle domande frequenti; il team esaminerà ciò che richiede una persona. Rispondi a questa email per aggiungere dettagli.'],
 tr:['Wazap talebinizi aldık','Talebiniz kaydedildi. Otomatik asistanımız sık sorulan sorulara yardımcı olabilir; insan desteği gereken konuları ekibimiz inceleyecektir. Ayrıntı eklemek için bu e-postayı yanıtlayabilirsiniz.'],
 pt:['Recebemos o seu pedido ao Wazap','O seu pedido foi guardado. O nosso assistente automático pode ajudar com perguntas frequentes; a equipa analisará o que precisar de atendimento humano. Responda a este email para acrescentar detalhes.'],
 ar:['تلقينا طلبك في Wazap','تم حفظ طلبك. يمكن لمساعدنا الآلي الإجابة عن الأسئلة الشائعة، وسيُراجع الفريق ما يحتاج إلى تدخل بشري. يمكنك الرد على هذه الرسالة لإضافة التفاصيل.'],
 fr:['Nous avons reçu votre demande Wazap','Votre demande est enregistrée. Notre assistant automatique peut répondre aux questions courantes ; notre équipe examinera ce qui nécessite une intervention humaine. Répondez à cet e-mail pour ajouter des détails.'],
 hi:['हमें आपका Wazap अनुरोध मिला है','आपका अनुरोध सुरक्षित है। हमारा स्वचालित सहायक सामान्य प्रश्नों में मदद कर सकता है; जिन मामलों में व्यक्ति की ज़रूरत है, उनकी टीम समीक्षा करेगी। अधिक जानकारी देने के लिए इस ईमेल का उत्तर दें।']
};
export function acknowledgement(language:string,channel:EmailChannel,requestId:string){const [subject,body]=acknowledgements[language]||acknowledgements.en;return {subject,html:serviceEmail({subject,heading:subject,body:`${body}\n\nReference: ${requestId}`,channel,language})};}
