import { queueBillingNotice } from "@/lib/billing-email";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Daily: downgrade any paid plan whose paid period has ended. Runs on a
// schedule so expiry is automatic (not only when the admin page loads).
// Active card subscriptions get their planExpiresAt extended by the LS
// renewal webhook BEFORE it lapses, so this only catches genuinely-ended ones.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const candidates = await prisma.user.findMany({where:{plan:{not:"free"},planExpiresAt:{not:null,lte:new Date()}},select:{id:true,email:true,name:true,plan:true,planExpiresAt:true}});
  let expired=0;
  for(const user of candidates){
    const changed=await prisma.$transaction(async tx=>{
      const result=await tx.user.updateMany({where:{id:user.id,plan:user.plan,planExpiresAt:user.planExpiresAt},data:{plan:"free",planExpiresAt:null}});
      if(result.count)await queueBillingNotice({key:`expiry:${user.id}:${user.planExpiresAt!.toISOString()}`,userId:user.id,email:user.email,name:user.name,plan:user.plan,state:"expired",accessUntil:user.planExpiresAt},tx);
      return result.count;
    });
    expired+=changed;
  }
  return NextResponse.json({ ok: true, expired });
}
