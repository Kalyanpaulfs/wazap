import http from 'node:http';
import fs from 'node:fs';
function call(message,history=[]){return new Promise((resolve,reject)=>{const started=Date.now();const request=http.request({socketPath:'/run/wazap-support-worker/worker.sock',method:'POST',path:'/answer',headers:{'Content-Type':'application/json'}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{try{if(res.statusCode!==200)throw Error('worker_unavailable');resolve({...JSON.parse(body),milliseconds:Date.now()-started});}catch(error){reject(error);}});});request.on('error',reject);request.end(JSON.stringify({message,history}));});}
const cases=[
 {id:'spanish',message:'¿Cómo agrego un botón de WhatsApp a mi sitio web?',language:'es',path:'/tools/widget'},
 {id:'portuguese',message:'Como posso colocar um botão do WhatsApp no meu site?',language:'pt',path:'/tools/widget'},
 {id:'russian',message:'Как добавить кнопку WhatsApp на мой сайт?',language:'ru',path:'/tools/widget'},
 {id:'chinese',message:'如何在我的网站上添加 WhatsApp 按钮？',language:'zh',path:'/tools/widget'},
 {id:'japanese',message:'ウェブサイトにWhatsAppのボタンを追加するにはどうすればよいですか？',language:'ja',path:'/tools/widget'},
 {id:'urdu',message:'میں اپنی ویب سائٹ پر واٹس ایپ کا بٹن کیسے لگا سکتا ہوں؟',language:'ur',path:'/tools/widget'},
 {id:'bengali',message:'আমি আমার ওয়েবসাইটে হোয়াটসঅ্যাপ বোতাম কীভাবে যুক্ত করব?',language:'bn',path:'/tools/widget'},
 {id:'swahili',message:'Ninawezaje kuongeza kitufe cha WhatsApp kwenye tovuti yangu?',language:'sw',path:'/tools/widget'},
 {id:'language-switch',message:'Antworte bitte auf Deutsch: Wie füge ich einen WhatsApp-Button auf meiner Website hinzu?',history:[{role:'user',content:'Please explain in English.'},{role:'assistant',content:'I can help you.'}],language:'de',path:'/tools/widget'},
 {id:'preference-history',message:'👍',history:[{role:'user',content:'Please always answer me in Italian. How do I add a WhatsApp button?'},{role:'assistant',content:'Puoi usare il generatore di widget alla pagina /tools/widget.'}],language:'it'},
];
const results=[];
for(const test of cases){const result=await call(test.message,test.history);const passed=result.language.split('-')[0]===test.language&&(test.handoff===undefined||result.handoff===test.handoff)&&(!test.path||result.reply.includes(test.path))&&!/access_token|refresh_token|eyJ[A-Za-z0-9_-]{20}|sk-[A-Za-z0-9]{20}/.test(result.reply);results.push({id:test.id,passed,...result});console.log(JSON.stringify({id:test.id,passed,language:result.language,handoff:result.handoff,milliseconds:result.milliseconds}));}
fs.writeFileSync('/opt/wazap-support-worker/world-language-evaluation.json',JSON.stringify({date:new Date().toISOString(),results},null,2),{mode:0o600});
if(results.some(result=>!result.passed))process.exitCode=1;
