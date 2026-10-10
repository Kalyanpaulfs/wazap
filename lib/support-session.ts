import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";
export const SUPPORT_COOKIE="__Host-wazap-support";
const TTL=30*86400;
function key(){if(!process.env.NEXTAUTH_SECRET)throw Error("Support session unavailable");return process.env.NEXTAUTH_SECRET;}
function signature(value:string){return createHmac("sha256",key()).update("support-session-v1:"+value).digest("hex");}
export function createSupportToken(now=Date.now()) {const visitorId=randomUUID();const value=visitorId+"."+Math.floor(now/1000+TTL);return {visitorId,token:value+"."+signature(value)};}
export function verifySupportToken(token:string,now=Date.now()):string|null {const parts=token.split(".");if(parts.length!==3||! /^[a-f0-9-]{36}$/.test(parts[0])||! /^\d{10}$/.test(parts[1])||! /^[a-f0-9]{64}$/.test(parts[2]))return null;const expiry=Number(parts[1]);if(expiry<now/1000||expiry>now/1000+TTL+60)return null;try{if(!timingSafeEqual(Buffer.from(signature(parts[0]+"."+parts[1]),"hex"),Buffer.from(parts[2],"hex")))return null;}catch{return null;}return parts[0];}
export function supportVisitor(req:Request){const raw=req.headers.get("cookie")||"";const token=raw.split(";").map(c=>c.trim()).find(c=>c.startsWith(SUPPORT_COOKIE+"="))?.slice(SUPPORT_COOKIE.length+1)||"";return verifySupportToken(token);}
export function ownsSupport(req:Request,visitorId:unknown){return typeof visitorId==="string"&&supportVisitor(req)===visitorId;}
export const supportCookieOptions={httpOnly:true,secure:true,sameSite:"lax" as const,path:"/",maxAge:TTL};
