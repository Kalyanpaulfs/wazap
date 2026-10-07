import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {captureCrmLead,crmText,validEmail,sameSiteRequest} from '@/lib/crm';
import {requestNewsletter} from '@/lib/crm-marketing';
import {rateLimit} from '@/lib/rate-limit';
import {requestIp} from '@/lib/request-ip';
export async function POST(req:Request){
 if(!sameSiteRequest(req))return NextResponse.json({error:'Invalid origin.'},{status:403});if(!rateLimit(`newsletter:${requestIp(req.headers)}`,3,3600000))return NextResponse.json({error:'Please wait before requesting another subscription.'},{status:429});const body=await req.json().catch(()=>({}));const name=crmText(body.name),email=crmText(body.email,255).toLowerCase();if(name.length<2||!validEmail(email)||body.consent!==true)return NextResponse.json({error:'Enter your name, valid email and select newsletter permission.'},{status:400});
 try{await prisma.$transaction(async tx=>{const lead=await captureCrmLead(tx,{name,email,source:'newsletter'});await requestNewsletter(tx,lead,'newsletter form');});return NextResponse.json({ok:true,message:'Your request is saved. If eligible, a confirmation email will be sent. You are subscribed only after confirming.'});}catch{return NextResponse.json({error:'Your request could not be saved. Please retry.'},{status:503});}
}
