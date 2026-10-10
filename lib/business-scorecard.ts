import {prisma} from "./prisma";
import {readBusinessLedger,summarizeBusinessLedger} from "./business-ledger";
function percentile(values:number[],p:number){return values.length?values.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]:null;}
export async function businessScorecard(now=new Date()){
 const since=new Date(now.getTime()-30*86400000),matureBefore=new Date(now.getTime()-7*86400000);
 const users=await prisma.user.findMany({where:{isAdmin:false,createdAt:{gte:since}},select:{id:true,createdAt:true},orderBy:{createdAt:"asc"},take:1000});
 const ids=users.map(u=>u.id);
 const [routers,starts,ledger]=await Promise.all([prisma.rotatorLink.groupBy({by:["userId"],where:{userId:{in:ids}},_min:{createdAt:true}}),prisma.conversationStart.groupBy({by:["userId"],where:{userId:{in:ids},assetType:"rotator"},_min:{createdAt:true}}),readBusinessLedger()]);
 const mature=users.filter(u=>u.createdAt<=matureBefore),setupTimes:number[]=[],startTimes:number[]=[];
 for(const u of mature){const r=routers.find(r=>r.userId===u.id)?._min.createdAt;const c=starts.find(c=>c.userId===u.id)?._min.createdAt;if(r&&r>=u.createdAt&&r.getTime()-u.createdAt.getTime()<=7*86400000)setupTimes.push((r.getTime()-u.createdAt.getTime())/60000);if(c&&c>=u.createdAt&&c.getTime()-u.createdAt.getTime()<=7*86400000)startTimes.push((c.getTime()-u.createdAt.getTime())/60000);}
 return {observedAt:now.toISOString(),onboarding:{cohortWindow:"Signups in last 30 days; only accounts at least seven days old enter the seven-day completion denominator",signupRows:users.length,eligibleSevenDayAccounts:mature.length,immatureAccounts:users.length-mature.length,routerCreatedWithinSevenDays:setupTimes.length,trackedRouterEventWithinSevenDays:startTimes.length,incompleteSetup:mature.length-setupTimes.length,setupMinutesMedian:percentile(setupTimes,.5),setupMinutesP90:percentile(setupTimes,.9),trackedEventMinutesMedian:percentile(startTimes,.5),warning:"Non-admin rows only; QA/bot classification incomplete. Router creation is setup; tracked events may be owner tests and do not prove external customer value, messages or sales."},costs:summarizeBusinessLedger(ledger,now.toISOString().slice(0,7)),ledgerEntries:ledger.slice(-100).reverse(),profitability:{status:"Unknown until actual cost coverage and provider-reconciled recurring revenue are complete"}};
}
