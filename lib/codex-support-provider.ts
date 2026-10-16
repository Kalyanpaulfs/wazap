import "server-only";
import http from "node:http";

export type SupportAnswer = { reply: string; language: string; handoff: boolean; reason: string; fallback?: string };

// Local-only stand-in for the real support-worker socket, so the handoff
// flow can be exercised end to end on a laptop without the socket running.
// Gated on NODE_ENV !== "production" AND the explicit opt-in env var, so it
// can never activate in production even if the var leaks into an env file.
function fakeSupportAnswer(message: string): SupportAnswer {
  const text = message.toLowerCase();
  const topic = ["refund", "human", "payment", "charged"].find(word => new RegExp(`\\b${word}\\b`).test(text));
  if (topic) return { reply: "I can't solve this one myself.", language: "en", handoff: true, reason: topic };
  return { reply: "(Test AI) Here's how: open the tool from your dashboard, follow the on-screen steps, and save your changes.", language: "en", handoff: false, reason: "" };
}

export async function codexSupportAnswer(message: string, history: {role:string;content:string}[]): Promise<SupportAnswer | null> {
  if (process.env.NODE_ENV !== "production" && process.env.WAZAP_SUPPORT_FAKE_AI === "true") return fakeSupportAnswer(message);
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
