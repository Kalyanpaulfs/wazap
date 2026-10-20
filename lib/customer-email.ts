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
// SUPPORT-2 ("no AI"): these never promise an automated assistant - a human
// team replies, within 12 hours (see SUPPORT_REPLY_TARGET_HOURS in
// lib/support-queue.ts).
const acknowledgements:Record<string,[string,string]>={
 en:['We received your Wazap request','Thanks - we’ve received your message. Our team will reply within 12 hours. Reply to this email to add details.'],
 es:['Hemos recibido tu consulta a Wazap','Gracias: hemos recibido tu mensaje. Nuestro equipo te responderá en un plazo de 12 horas. Responde a este correo para añadir detalles.'],
 ru:['Мы получили ваш запрос в Wazap','Спасибо — мы получили ваше сообщение. Наша команда ответит в течение 12 часов. Ответьте на это письмо, чтобы добавить подробности.'],
 zh:['我们已收到您的 Wazap 请求','感谢您——我们已收到您的消息。我们的团队将在12小时内回复您。您可以回复此邮件补充信息。'],
 it:['Abbiamo ricevuto la tua richiesta a Wazap','Grazie: abbiamo ricevuto il tuo messaggio. Il nostro team risponderà entro 12 ore. Rispondi a questa email per aggiungere dettagli.'],
 tr:['Wazap talebinizi aldık','Teşekkürler - mesajınızı aldık. Ekibimiz 12 saat içinde yanıt verecektir. Ayrıntı eklemek için bu e-postayı yanıtlayabilirsiniz.'],
 pt:['Recebemos o seu pedido ao Wazap','Obrigado - recebemos a sua mensagem. A nossa equipa responderá em até 12 horas. Responda a este email para acrescentar detalhes.'],
 ar:['تلقينا طلبك في Wazap','شكرًا لك — لقد تلقينا رسالتك. سيقوم فريقنا بالرد في أقل من 12 ساعة. يمكنك الرد على هذه الرسالة لإضافة التفاصيل.'],
 fr:['Nous avons reçu votre demande Wazap','Merci - nous avons bien reçu votre message. Notre équipe vous répondra dans les 12 heures. Répondez à cet e-mail pour ajouter des détails.'],
 hi:['हमें आपका Wazap अनुरोध मिला है','धन्यवाद — हमें आपका संदेश मिल गया है। हमारी टीम 12 घंटे के भीतर जवाब देगी। अधिक जानकारी देने के लिए इस ईमेल का उत्तर दें।']
};
export function acknowledgement(language:string,channel:EmailChannel,requestId:string){const [subject,body]=acknowledgements[language]||acknowledgements.en;return {subject,html:serviceEmail({subject,heading:subject,body:`${body}\n\nReference: ${requestId}`,channel,language})};}
