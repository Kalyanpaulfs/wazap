import {prisma} from "./prisma";
import {ensurePersonalWorkspace} from "./workspaces";
import {routerQuota} from "./router-entitlements";
type Router={id:string;userId:string;name?:string;code:string;numbers:string[];fallbackNumber?:string|null;message?:string|null;currentIdx:number};
export async function claimRouterHandoff(router:Router,now=new Date()){
 const membership=await ensurePersonalWorkspace(router.userId);
 return prisma.$transaction(async tx=>{
  // Serialize quota checks and reservation across every router belonging to this owner.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${router.userId} FOR UPDATE`;
  const owner=await tx.user.findUnique({where:{id:router.userId},select:{plan:true,planExpiresAt:true,trialPlan:true,trialEndsAt:true,createdAt:true}});
  const used=await tx.conversationStart.count({where:{userId:router.userId,assetType:"rotator"}});
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
