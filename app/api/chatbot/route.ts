import {ownsSupport} from "@/lib/support-session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { capturedChat,sameSiteRequest } from "@/lib/crm";
import { requestIp } from "@/lib/request-ip";
import { codexSupportAnswer } from "@/lib/codex-support-provider";
import { rememberChatFallback, chatFallback } from "@/lib/chat-fallback";
import { recordChatbotTurn } from "@/lib/support-chat-service";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const ip = requestIp(req.headers);
  if (!rateLimit(`chatbot:${ip}`, 40, 60 * 60 * 1000)) return NextResponse.json({ reply: "Please wait a moment before sending another message." }, { status: 429 });
  const { message, visitorId } = await req.json().catch(()=>({})) as { message?: unknown; visitorId?: unknown };
  if(typeof visitorId!=="string"||typeof message!=="string"||!message.trim()||message.length>4000)return NextResponse.json({error:"A visitor and message are required."},{status:400});
  if(!ownsSupport(req,visitorId))return NextResponse.json({error:"Support session required."},{status:403});
  const profile=await capturedChat(visitorId);
  if(!profile)return NextResponse.json({error:"Please enter your name, email and phone number before starting chat.",contactRequired:true},{status:422});
  const previousMessages=await prisma.supportChatMessage.findMany({where:{conversationId:profile.id},orderBy:{createdAt:"desc"},take:8,select:{sender:true,body:true}});
  const history=previousMessages.reverse().map(turn=>({role:turn.sender==="visitor"?"user":"assistant",content:turn.body}));
  const answer=await codexSupportAnswer(message.trim(),history);
  if(answer?.fallback)await rememberChatFallback(visitorId,answer.language,answer.fallback);
  const fallback=answer?null:await chatFallback(visitorId);
  const reply=answer?.reply||fallback!.reply;

  const purchasePattern = /price|pricing|cost|pay|paid|buy|purchase|subscribe|subscription|upgrade|business|team|demo|quote|invoice/i;
  const issuePattern = /problem|issue|bug|error|not working|can't|cannot|stuck|refund|cancel/i;
  const featurePattern = /widget|rotator|link|catalog|lead|qr|vcard|campaign|tool/i;
  const intent = purchasePattern.test(message) ? "purchase" : issuePattern.test(message) ? "support" : featurePattern.test(message) ? "feature" : "general";
  const leadScore = intent === "purchase" ? 80 : intent === "support" ? 40 : intent === "feature" ? 25 : 10;

  const { supportRequest, handoff } = await recordChatbotTurn({ visitorId, message, answer, reply, intent, leadScore, crmLeadId: profile.crmLeadId });

  return NextResponse.json({ reply, supportRequest, conversationId:profile.id, intent, language:answer?.language||fallback?.language||null, aiAvailable:Boolean(answer), ...(handoff?{handoff}:{}) });
}
