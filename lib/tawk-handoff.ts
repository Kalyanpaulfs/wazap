'use client';
type Turn={role:string;text:string};
type Tawk={visitor?:{name:string;email:string};onLoad?:()=>void;onChatStarted?:()=>void;onBeforeLoad?:()=>void;maximize?:()=>void;showWidget?:()=>void;hideWidget?:()=>void;setAttributes?:(attrs:Record<string,string>,callback:(error?:string)=>void)=>void;addEvent?:(event:string,attrs:Record<string,string>,callback:(error?:string)=>void)=>void;setChatInputMessage?:(text:string,callback:(error?:string)=>void)=>void;isChatOngoing?:()=>boolean};
declare global {interface Window{Tawk_API?:Tawk}}
let ready:Promise<void>|undefined;
let publishCurrent:(()=>void)|undefined;
export function handoffMetadata(reference:string,turns:Turn[]){const text=turns.slice(-20).map(t=>`${t.role==='user'?'Customer':t.role==='admin'?'Team':'Wazap AI'}: ${t.text}`).join('\n').slice(-11000);const attrs:Record<string,string>={'wazap-reference':reference,'wazap-history':'https://wazap.lt/admin/crm/support?chat='+encodeURIComponent(reference)};for(let i=0;i<text.length;i+=240)attrs['history-'+String(i/240+1).padStart(2,'0')]=text.slice(i,i+240);return attrs;}
export async function openTawkHandoff(input:{name:string;email:string;reference:string;turns:Turn[];onError:(message:string)=>void}){
 if(!ready)ready=new Promise<void>((resolve,reject)=>{
  const api=window.Tawk_API=window.Tawk_API||{};
  api.visitor={name:input.name,email:input.email};
  api.onChatStarted=()=>publishCurrent?.();
  api.onBeforeLoad=()=>api.hideWidget?.();
  const script=document.createElement('script');
  let settled=false;
  const fail=(message:string)=>{if(settled)return;settled=true;clearTimeout(timer);ready=undefined;script.remove();reject(Error(message));};
  const timer=setTimeout(()=>fail('Live chat is taking longer to connect. Please retry; your conversation remains saved.'),20000);
  api.onLoad=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve();};
  script.src='https://embed.tawk.to/6ac65eb8de9c4734c87b0ceb/1k4be40e8';script.async=true;script.charset='UTF-8';script.crossOrigin='anonymous';
  script.onerror=()=>fail('Live chat could not load. Your Wazap conversation is saved; please retry.');
  document.head.appendChild(script);
 });
 await ready;
 const api=window.Tawk_API!;let submitted=false;const publish=()=>{if(submitted)return;submitted=true;api.addEvent?.('wazap-handoff',handoffMetadata(input.reference,input.turns),error=>{if(error){submitted=false;input.onError('Your Wazap history is saved, but could not be attached to live chat. Give the agent reference '+input.reference+'.');}});};
 publishCurrent=publish;publish();
 api.setAttributes?.(handoffMetadata(input.reference,input.turns),error=>{if(error)input.onError('History could not be attached. Your saved Wazap request is '+input.reference+'.');});
 api.showWidget?.();api.maximize?.();api.setChatInputMessage?.('Please help with Wazap request '+input.reference+'. The preceding conversation is attached for the team.',()=>{});
}
