import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";

export const CRM_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export const CRM_OPEN_STAGES = ["new", "contacted", "qualified", "proposal"];
export function crmText(value:unknown,max=120){return typeof value==="string"?value.trim().slice(0,max):"";}
export function validEmail(email:string){return email.length<=255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}
export function normalizeContactPhone(value:unknown){const raw=crmText(value,40).replace(/[\s().-]/g,"").replace(/^00/,"+");return /^\+[1-9]\d{7,14}$/.test(raw)?raw:null;}
export function sameSiteRequest(req:Request){const origin=req.headers.get("origin");return !origin||origin===new URL(process.env.NEXTAUTH_URL||"https://wazap.lt").origin;}
export type CapturedContact={name:string;email:string;phone?:string|null;source:string;company?:string|null};
export async function captureCrmLead(tx:Prisma.TransactionClient,contact:CapturedContact){
  const email=contact.email.trim().toLowerCase();
  // A public form never overwrites an existing sales owner's stage or identity.
  const lead=await tx.crmLead.upsert({where:{email},create:{email,name:contact.name||email,phone:contact.phone||null,company:contact.company||null,source:contact.source,confirmationNonce:randomUUID()},update:{lastActivityAt:new Date()}});
  if((!lead.phone&&contact.phone)||((lead.name===lead.email||!lead.name)&&contact.name))return tx.crmLead.update({where:{id:lead.id},data:{...(!lead.phone&&contact.phone?{phone:contact.phone}:{}),...((lead.name===lead.email||!lead.name)&&contact.name?{name:contact.name}:{})}});
  return lead;
}
export async function capturedChat(visitorId:string){const thread=await prisma.supportConversation.findUnique({where:{visitorId},select:{id:true,name:true,email:true,phone:true,contactCapturedAt:true,crmLeadId:true,status:true}});return thread?.name&&thread.email&&thread.phone&&thread.contactCapturedAt&&thread.crmLeadId?thread:null;}
