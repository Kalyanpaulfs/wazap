import http from 'node:http';
import {createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import {prisma} from './prisma';
import {customerLanguage} from './customer-email';
const root='/opt/wazap-private/email-translations';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function localizeEmail(to:string,subject:string,html:string):Promise<{subject:string;html:string}>{
 const language=await customerLanguage(to);
 const existing=html.match(/<html[^>]*lang=["']([^"']+)["']/i)?.[1]?.toLowerCase()||'en';
 if(language==='en'||language===existing)return {subject,html};
 const user=await prisma.user.findFirst({where:{email:{equals:to,mode:'insensitive'}},select:{name:true}});
 const segments:string[]=[subject],parts:string[]=[];const pattern=/(<[^>]+>)/g;let hidden=false;
 for(const part of html.split(pattern)){
  if(part.startsWith('<')){parts.push(part);if(/^<(style|script)\b/i.test(part))hidden=true;if(/^<\/(style|script)>/i.test(part))hidden=false;continue;}
  if(hidden||!part.trim()){parts.push(part);continue;}
  const decoded=part.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  const i=segments.push(decoded)-1;parts.push(`__WAZAP_TEXT_${i}__`);
 }
 const frozen:string[][]=[];const protectedSegments=segments.map(text=>{const values:string[]=[];const nameProtected=user?.name?text.split(user.name).join('[[CUSTOMER_NAME]]'):text;const result=nameProtected.replace(/https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:Wazap|WhatsApp|USD|Growth|Business|Enterprise|Starter|Free)\b|\b\d[\w.,:/-]*\b/gi,value=>{values.push(value);return `[[KEEP_${values.length-1}]]`;});frozen.push(values);return result;});
 const key=createHash('sha256').update(JSON.stringify({version:1,language,segments:protectedSegments})).digest('hex');let translated:string[]|undefined;
 try{const saved=JSON.parse(await fs.readFile(`${root}/${key}.json`,'utf8'));if(saved.language===language)translated=saved.texts;}catch{}
 if(!translated){translated=await new Promise<string[]|undefined>(resolve=>{const req=http.request({socketPath:'/run/wazap-support-worker/worker.sock',path:'/translate',method:'POST',headers:{'Content-Type':'application/json'}},res=>{let body='';res.on('data',chunk=>{body+=chunk;if(body.length>100000)req.destroy();});res.on('end',()=>{try{const result=JSON.parse(body);if(res.statusCode!==200)throw Error();resolve(JSON.parse(result.reply));}catch{resolve(undefined);}});res.on('error',()=>resolve(undefined));});req.setTimeout(60000,()=>req.destroy());req.on('error',()=>resolve(undefined));req.end(JSON.stringify({language,texts:protectedSegments}));});}
 if(!Array.isArray(translated)||translated.length!==segments.length||translated.some(x=>typeof x!=='string'||!x.trim()))throw Error('Email translation unavailable; retry before delivery.');
 const restored=translated.map((text,i)=>{if(text.split('[[CUSTOMER_NAME]]').length!==protectedSegments[i].split('[[CUSTOMER_NAME]]').length)throw Error('Email translation changed a customer name.');const extra=text.replace(/\[\[KEEP_\d+\]\]/g,'').replace(/\[\[CUSTOMER_NAME\]\]/g,'');if(/https?:|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(extra)||/\p{N}/u.test(extra))throw Error('Email translation added unapproved values.');for(let j=0;j<frozen[i].length;j++){const token=`[[KEEP_${j}]]`;if(text.split(token).length!==protectedSegments[i].split(token).length)throw Error('Email translation changed a protected value.');}if(/\[\[KEEP_\d+\]\]/g.test(text.replace(/\[\[KEEP_(\d+)\]\]/g,(match,j)=>frozen[i][Number(j)]??match)))throw Error('Invalid translation placeholder.');return text.replace(/\[\[KEEP_(\d+)\]\]/g,(_,j)=>frozen[i][Number(j)]).replace(/\[\[CUSTOMER_NAME\]\]/g,()=>user?.name||'');});
 await fs.mkdir(root,{recursive:true,mode:0o700});await fs.writeFile(`${root}/${key}.json`,JSON.stringify({language,texts:translated}),{mode:0o600});
 let localized=parts.join('').replace(/__WAZAP_TEXT_(\d+)__/g,(_,i)=>escape(restored[Number(i)]));const rtl=['ar','he','fa','ur','ps','dv','yi'].includes(language.split('-')[0]);
 localized=localized.replace(/<html\b[^>]*>/i,`<html lang="${language}" dir="${rtl?'rtl':'ltr'}">`);
 return {subject:restored[0].replace(/[\r\n]/g,' ').slice(0,500),html:localized};
}
