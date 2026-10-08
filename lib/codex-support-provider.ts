import "server-only";
import http from "node:http";

export type SupportAnswer = { reply: string; language: string; handoff: boolean; reason: string; fallback?: string };
export async function codexSupportAnswer(message: string, history: {role:string;content:string}[]): Promise<SupportAnswer | null> {
  if (process.env.WAZAP_CODEX_SUPPORT !== "enabled") return null;
  return new Promise(resolve => {
    const request = http.request({socketPath:"/run/wazap-support-worker/worker.sock",path:"/answer",method:"POST",headers:{"Content-Type":"application/json"}}, response => {
      let body="";
      response.on("data",chunk=>{body+=chunk;if(body.length>20000)request.destroy();});
      response.on("end",()=>{try{if(response.statusCode!==200)throw Error();const value=JSON.parse(body);if(typeof value.reply!=="string"||!value.reply.trim()||value.reply.length>6000||typeof value.handoff!=="boolean"||typeof value.language!=="string"||typeof value.reason!=="string")throw Error();resolve(value);}catch{resolve(null);}});
      response.on("error",()=>resolve(null));
    });
    request.setTimeout(60000,()=>request.destroy());
    request.on("error",()=>resolve(null));
    request.end(JSON.stringify({message,history}));
  });
}
