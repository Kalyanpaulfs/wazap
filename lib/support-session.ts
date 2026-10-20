import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";
export const SUPPORT_COOKIE="__Host-wazap-support";
const TTL=30*86400;
function key(){if(!process.env.NEXTAUTH_SECRET)throw Error("Support session unavailable");return process.env.NEXTAUTH_SECRET;}
function signature(value:string){return createHmac("sha256",key()).update("support-session-v1:"+value).digest("hex");}
// Sign a support-ownership token for a SPECIFIC visitorId (must already be a
// UUID, same shape randomUUID() produces - see verifySupportToken's format
// check). createSupportToken (new random visitor) builds on this.
export function createSupportTokenFor(visitorId:string,now=Date.now()){const value=visitorId+"."+Math.floor(now/1000+TTL);return value+"."+signature(value);}
export function createSupportToken(now=Date.now()) {const visitorId=randomUUID();return {visitorId,token:createSupportTokenFor(visitorId,now)};}
export function verifySupportToken(token:string,now=Date.now()):string|null {const parts=token.split(".");if(parts.length!==3||! /^[a-f0-9-]{36}$/.test(parts[0])||! /^\d{10}$/.test(parts[1])||! /^[a-f0-9]{64}$/.test(parts[2]))return null;const expiry=Number(parts[1]);if(expiry<now/1000||expiry>now/1000+TTL+60)return null;try{if(!timingSafeEqual(Buffer.from(signature(parts[0]+"."+parts[1]),"hex"),Buffer.from(parts[2],"hex")))return null;}catch{return null;}return parts[0];}
export function supportVisitor(req:Request){const raw=req.headers.get("cookie")||"";const token=raw.split(";").map(c=>c.trim()).find(c=>c.startsWith(SUPPORT_COOKIE+"="))?.slice(SUPPORT_COOKIE.length+1)||"";return verifySupportToken(token);}
export function ownsSupport(req:Request,visitorId:unknown){return typeof visitorId==="string"&&supportVisitor(req)===visitorId;}
export const supportCookieOptions={httpOnly:true,secure:true,sameSite:"lax" as const,path:"/",maxAge:TTL};

// "Continue the chat" email link token (admin reply -> customer email ->
// /support/continue?t=...): signs the visitorId with a 14-day expiry, in a
// separate HMAC domain ("support-continue-v1") so these tokens can never be
// replayed as a support-session cookie value or vice versa. The visitorId is
// base64url-encoded so it can safely contain any characters (it is
// client-supplied, not necessarily a UUID, up to 120 chars - see
// app/api/support/tickets/**).
const CONTINUE_TTL=14*86400;
function continueSignature(value:string){return createHmac("sha256",key()).update("support-continue-v1:"+value).digest("hex");}
export function createContinueToken(visitorId:string,now=Date.now()):string{
  const encoded=Buffer.from(visitorId,"utf8").toString("base64url");
  const value=encoded+"."+Math.floor(now/1000+CONTINUE_TTL);
  return value+"."+continueSignature(value);
}
// Shared "how to reopen a solved ticket" text for the solved/auto-solved
// emails (lib/support-tickets.ts, lib/support-monitor.ts). Email replies do
// NOT reach a ticket (support@ is not polled back into SupportTicket), so
// this must be a link the visitor can click, not "just reply" - the same
// continue-chat token the "new reply" email already uses. Logged-in users
// (ticket.userId set) also get a direct /support/tickets link.
export function reopenTicketText(opts:{visitorId:string;ticketNumber:string;userId?:string|null;base:string}):string{
  const token=createContinueToken(opts.visitorId);
  const reopenUrl=`${opts.base}/support/continue?t=${encodeURIComponent(token)}`;
  const myTickets=opts.userId?`\n\nSee all your tickets: ${opts.base}/support/tickets`:"";
  return `If this isn't fixed, you can reopen ticket #${opts.ticketNumber} within 7 days: ${reopenUrl}${myTickets}`;
}

export function verifyContinueToken(token:string,now=Date.now()):string|null{
  const parts=token.split(".");
  if(parts.length!==3|| !/^\d{10}$/.test(parts[1])|| !/^[a-f0-9]{64}$/.test(parts[2]))return null;
  const expiry=Number(parts[1]);
  if(expiry<now/1000||expiry>now/1000+CONTINUE_TTL+60)return null;
  try{if(!timingSafeEqual(Buffer.from(continueSignature(parts[0]+"."+parts[1]),"hex"),Buffer.from(parts[2],"hex")))return null;}catch{return null;}
  try{const visitorId=Buffer.from(parts[0],"base64url").toString("utf8");return visitorId||null;}catch{return null;}
}
