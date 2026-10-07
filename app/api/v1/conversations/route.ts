import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { abandonApiMutation, authenticateApi, beginApiMutation, enqueueWebhookEvent, finishApiMutation, logApiRequest, replayApiMutation } from "@/lib/developer-platform";
import { cleanContactAddress, cleanInboxText } from "@/lib/inbox";

function apiError(status:number,code:string,message:string,requestId?:string){return NextResponse.json({error:{code,message},meta:requestId?{requestId}:undefined},{status})}
export async function GET(req:Request){const auth=await authenticateApi(req,"conversations:read");if(!auth.context)return apiError(auth.error!.status,auth.error!.code,auth.error!.message);const ctx=auth.context;const url=new URL(req.url);const limit=Math.max(1,Math.min(Number(url.searchParams.get("limit"))||25,100));const status=url.searchParams.get("status");const after=url.searchParams.get("after");const items=await prisma.inboxConversation.findMany({where:{workspaceId:ctx.workspaceId,...(["open","pending","resolved"].includes(status||"")?{status:status!}:{})},orderBy:{id:"asc"},take:limit+1,...(after?{cursor:{id:after},skip:1}:{}),select:{id:true,channel:true,contactName:true,contactAddress:true,status:true,priority:true,assignedMemberId:true,unreadCount:true,tags:true,lastMessageAt:true,lastMessagePreview:true,createdAt:true,updatedAt:true}});const hasMore=items.length>limit;const data=items.slice(0,limit);await logApiRequest(ctx,req,200);return NextResponse.json({data,meta:{hasMore,nextCursor:hasMore?data.at(-1)?.id:null,requestId:ctx.requestId}})}

export async function POST(req:Request){
  const auth=await authenticateApi(req,"conversations:write");if(!auth.context)return apiError(auth.error!.status,auth.error!.code,auth.error!.message);
  const ctx=auth.context,body=await req.json().catch(()=>({}));
  const channel=["whatsapp","instagram","messenger","email","sms","rcs","telegram"].includes(body.channel)?body.channel:"whatsapp";
  const contactName=cleanInboxText(body.contactName,100),contactAddress=cleanContactAddress(body.contactAddress,channel),text=cleanInboxText(body.initialMessage,4000);
  if(!contactName||!contactAddress){await logApiRequest(ctx,req,400,"validation_error");return apiError(400,"validation_error","contactName and contactAddress are required.",ctx.requestId)}
  const mutation=await beginApiMutation(req,ctx,body);
  if(mutation.state==="error"){await logApiRequest(ctx,req,mutation.status,mutation.code);return apiError(mutation.status,mutation.code,mutation.message,ctx.requestId)}
  if(mutation.state==="replay"){await logApiRequest(ctx,req,mutation.statusCode,"idempotent_replay");return NextResponse.json(replayApiMutation(mutation,ctx.requestId),{status:mutation.statusCode})}
  try{
    const result=await prisma.$transaction(async tx=>{
      const existing=await tx.inboxConversation.findUnique({where:{workspaceId_channel_contactAddress:{workspaceId:ctx.workspaceId,channel,contactAddress}},select:{id:true}});
      const conversation=await tx.inboxConversation.upsert({where:{workspaceId_channel_contactAddress:{workspaceId:ctx.workspaceId,channel,contactAddress}},update:{contactName,status:"open",resolvedAt:null},create:{workspaceId:ctx.workspaceId,channel,contactName,contactAddress,tags:[]}});
      if(text){await tx.inboxMessage.create({data:{conversationId:conversation.id,direction:"inbound",senderType:"customer",text,deliveryStatus:"received"}});await tx.inboxConversation.update({where:{id:conversation.id},data:{unreadCount:{increment:1},lastMessagePreview:text.slice(0,180),lastMessageAt:new Date()}})}
      return{conversation,created:!existing};
    });
    const response={data:result.conversation,meta:{requestId:ctx.requestId,replayed:false},created:result.created};
    await finishApiMutation(mutation.keyHash,result.created?201:200,response);
    await enqueueWebhookEvent(ctx.workspaceId,result.created?"conversation.created":"conversation.updated",{conversationId:result.conversation.id,channel,contactName,contactAddress,source:"api"}).catch(()=>{});
    await logApiRequest(ctx,req,result.created?201:200);
    return NextResponse.json(response,{status:result.created?201:200});
  }catch(error){await abandonApiMutation(mutation.keyHash);await logApiRequest(ctx,req,500,"persistence_failed");return apiError(500,"persistence_failed","The conversation could not be recorded.",ctx.requestId)}
}
