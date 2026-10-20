import {prisma} from "./prisma";
import {ensurePersonalWorkspace} from "./workspaces";
import {routerQuota, TRIAL_METERED_ASSET_TYPES} from "./router-entitlements";
type Router={id:string;userId:string;name?:string;code:string;numbers:string[];fallbackNumber?:string|null;message?:string|null;currentIdx:number};
export async function claimRouterHandoff(router:Router,now=new Date()){
 const membership=await ensurePersonalWorkspace(router.userId);
 return prisma.$transaction(async tx=>{
  // Serialize quota checks and reservation across every router belonging to this owner.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${router.userId} FOR UPDATE`;
  const owner=await tx.user.findUnique({where:{id:router.userId},select:{plan:true,planExpiresAt:true,trialPlan:true,trialEndsAt:true,createdAt:true}});
  // Shared trial cap across rotator handoffs AND short-link clicks - see
  // TRIAL_METERED_ASSET_TYPES.
  const used=await tx.conversationStart.count({where:{userId:router.userId,assetType:{in:[...TRIAL_METERED_ASSET_TYPES]}}});
  if(!routerQuota(owner,used,now).allowed)return {allowed:false as const};
  const numbers=router.numbers.map(n=>n.replace(/\D/g,"")).filter(n=>n.length>=8);
  const fallback=(router.fallbackNumber||numbers[0]||process.env.WAZAP_DEFAULT_WHATSAPP_NUMBER||"").replace(/\D/g,"");
  if(!numbers.length&&!fallback)return {allowed:false as const,invalid:true};
  const claimed=await tx.rotatorLink.update({where:{id:router.id},data:{currentIdx:{increment:1},totalClicks:{increment:1}},select:{currentIdx:true}});
  const destination=numbers.length?numbers[(claimed.currentIdx-1)%numbers.length]:fallback;
  await tx.conversationStart.create({data:{userId:router.userId,workspaceId:membership.workspaceId,assetType:"rotator",assetId:router.id,assetName:router.name||null,source:"Wazap rotator",destination,createdAt:now}});
  return {allowed:true as const,destination};
 },{timeout:3000});
}

// Read-only trial-quota check, no transaction/lock and no mutation - for the
// "visitor is over the per-IP speed limit" branch in app/r/[code] and
// app/w/[code]: rotation/counting is skipped there (bot protection), but
// whether the owner has already used up their 100 trial leads must still be
// enforced, or a fast-enough burst of requests could bypass the cap
// entirely. A small amount of staleness (no lock) is fine here since this
// is purely a check, not a reservation.
export async function routerQuotaAllowed(userId:string,now=new Date()):Promise<boolean>{
 const owner=await prisma.user.findUnique({where:{id:userId},select:{plan:true,planExpiresAt:true,trialPlan:true,trialEndsAt:true,createdAt:true}});
 const used=await prisma.conversationStart.count({where:{userId,assetType:{in:[...TRIAL_METERED_ASSET_TYPES]}}});
 return routerQuota(owner,used,now).allowed;
}

type ShortLink={id:string;userId:string;name?:string|null;code:string;phone:string;message?:string|null};
// Short-link equivalent of claimRouterHandoff (FEAT-TRIAL-100-LEADS, audit
// item 12): a WhatsApp/brand short-link click counts against the SAME
// 100-lead trial cap as a rotator handoff, enforced the same way (locked
// quota check, then record). There is no rotation to advance - just a
// single destination number - so this increments ShortLink.clicks instead
// of currentIdx/totalClicks.
export async function claimShortLinkHandoff(link:ShortLink,now=new Date()){
 const membership=await ensurePersonalWorkspace(link.userId);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${link.userId} FOR UPDATE`;
  const owner=await tx.user.findUnique({where:{id:link.userId},select:{plan:true,planExpiresAt:true,trialPlan:true,trialEndsAt:true,createdAt:true}});
  const used=await tx.conversationStart.count({where:{userId:link.userId,assetType:{in:[...TRIAL_METERED_ASSET_TYPES]}}});
  if(!routerQuota(owner,used,now).allowed)return {allowed:false as const};
  await tx.shortLink.update({where:{id:link.id},data:{clicks:{increment:1}}});
  await tx.conversationStart.create({data:{userId:link.userId,workspaceId:membership.workspaceId,assetType:"short_link",assetId:link.id,assetName:link.name||null,source:"Wazap short link",destination:link.phone,createdAt:now}});
  return {allowed:true as const};
 },{timeout:3000});
}
