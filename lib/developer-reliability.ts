import { prisma } from "@/lib/prisma";

export const DEVELOPER_OBJECTIVES={apiAvailabilityPct:99.9,apiP95LatencyMs:750,webhookTerminalSuccessPct:99.5,webhookWithin15MinutesPct:99};
function percentile(values:number[],fraction:number){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*fraction)-1)]}
function percent(numerator:number,denominator:number){return denominator?Number((numerator/denominator*100).toFixed(3)):null}

export async function developerReliability(workspaceId:string,days=30){
  const since=new Date(Date.now()-Math.max(1,Math.min(days,90))*86_400_000),now=new Date();
  const [requests,deliveries,attempts]=await Promise.all([
    prisma.apiRequestLog.findMany({where:{workspaceId,createdAt:{gte:since}},select:{statusCode:true,latencyMs:true}}),
    prisma.webhookDelivery.findMany({where:{endpoint:{workspaceId},createdAt:{gte:since}},select:{status:true,createdAt:true,deliveredAt:true,attempts:true}}),
    prisma.webhookDeliveryAttempt.findMany({where:{delivery:{endpoint:{workspaceId}},createdAt:{gte:since}},select:{outcome:true,latencyMs:true,responseStatus:true}}),
  ]);
  const terminal=deliveries.filter(item=>["delivered","failed"].includes(item.status)),delivered=terminal.filter(item=>item.status==="delivered");
  const within15=delivered.filter(item=>item.deliveredAt&&item.deliveredAt.getTime()-item.createdAt.getTime()<=15*60_000).length;
  const metrics={
    apiRequestCount:requests.length,apiServerErrorCount:requests.filter(item=>item.statusCode>=500).length,
    apiAvailabilityPct:percent(requests.filter(item=>item.statusCode<500).length,requests.length),apiP50LatencyMs:percentile(requests.map(item=>item.latencyMs),.5),apiP95LatencyMs:percentile(requests.map(item=>item.latencyMs),.95),apiP99LatencyMs:percentile(requests.map(item=>item.latencyMs),.99),
    webhookDeliveryCount:deliveries.length,webhookDeliveredCount:delivered.length,webhookFailedCount:terminal.filter(item=>item.status==="failed").length,webhookPendingCount:deliveries.filter(item=>["queued","processing"].includes(item.status)).length,
    webhookTerminalSuccessPct:percent(delivered.length,terminal.length),webhookWithin15MinutesPct:percent(within15,delivered.length),webhookP95AttemptLatencyMs:percentile(attempts.map(item=>item.latencyMs),.95),webhookAttemptCount:attempts.length,
  };
  const apiEvidenceSufficient=requests.length>=100,webhookEvidenceSufficient=terminal.length>=20;
  return {window:{days,since,measuredAt:now},objectives:DEVELOPER_OBJECTIVES,metrics,evidence:{api:apiEvidenceSufficient?"sufficient":"insufficient",webhooks:webhookEvidenceSufficient?"sufficient":"insufficient"},results:{apiAvailability:apiEvidenceSufficient?metrics.apiAvailabilityPct!==null&&metrics.apiAvailabilityPct>=DEVELOPER_OBJECTIVES.apiAvailabilityPct:null,apiLatency:apiEvidenceSufficient?metrics.apiP95LatencyMs!==null&&metrics.apiP95LatencyMs<=DEVELOPER_OBJECTIVES.apiP95LatencyMs:null,webhookTerminalSuccess:webhookEvidenceSufficient?metrics.webhookTerminalSuccessPct!==null&&metrics.webhookTerminalSuccessPct>=DEVELOPER_OBJECTIVES.webhookTerminalSuccessPct:null,webhookTimeliness:webhookEvidenceSufficient?metrics.webhookWithin15MinutesPct!==null&&metrics.webhookWithin15MinutesPct>=DEVELOPER_OBJECTIVES.webhookWithin15MinutesPct:null}};
}
