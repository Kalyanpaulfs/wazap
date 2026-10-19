import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
const root=process.env.WAZAP_CHAT_FALLBACK_DIR||'/opt/wazap-private/chat-fallback';
const file=(visitorId:string)=>`${root}/${createHash('sha256').update(visitorId).digest('hex')}.json`;
export function validFallback(language:unknown,reply:unknown):boolean{
 return typeof language==='string'&&/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)&&typeof reply==='string'&&reply.trim().length>0&&reply.length<=1500&&!/https?:|www\.|<[^>]*>|javascript:|data:/i.test(reply)&&!/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(reply);
}
// Only a fixed translated outage notice and language are saved, never chat text or contact details.
export async function rememberChatFallback(visitorId:string,language:string,reply:string){
 if(!validFallback(language,reply))return;
 let temporary='';
 try{await fs.mkdir(root,{recursive:true,mode:0o700});temporary=`${file(visitorId)}.${randomUUID()}.tmp`;await fs.writeFile(temporary,JSON.stringify({language,reply:reply.trim()}),{mode:0o600});await fs.rename(temporary,file(visitorId));}
 catch{if(temporary)await fs.unlink(temporary).catch(()=>{});}
}
export async function chatFallback(visitorId:string):Promise<{language:string|null;reply:string}>{
 try{const value=JSON.parse(await fs.readFile(file(visitorId),'utf8'));if(validFallback(value.language,value.reply))return value;}catch{}
 // If no language was established, do not guess from nationality or force English.
 return {language:null,reply:'🤖 ⏸️\n💬 → 👤\n/support'};
}
