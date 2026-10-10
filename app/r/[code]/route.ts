import {claimRouterHandoff} from "@/lib/router-claim";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cacheRoute, readCachedRoute } from "@/lib/routing-cache";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();
  let rotator: { id?: string; userId?: string; name?: string; code: string; numbers: string[]; fallbackNumber?: string | null; message?: string | null; currentIdx: number } | null = null;
  try {
    rotator = await Promise.race([
      prisma.rotatorLink.findUnique({ where: { code: normalizedCode } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("routing database timeout")), 1200)),
    ]);
    if (rotator) await cacheRoute({ code: rotator.code, numbers: rotator.numbers, fallbackNumber: rotator.fallbackNumber, message: rotator.message, currentIdx: rotator.currentIdx }).catch(() => {});
  } catch {
    rotator = await readCachedRoute(normalizedCode);
  }
  if (!rotator) redirect("/");

  const validNumbers = rotator.numbers.map(number => number.replace(/\D/g, "")).filter(number => number.length >= 8);
  const fallback = (rotator.fallbackNumber || process.env.WAZAP_DEFAULT_WHATSAPP_NUMBER || validNumbers[0] || "").replace(/\D/g, "");
  if (!validNumbers.length && !fallback) redirect("/");
  let number=validNumbers[rotator.currentIdx % (validNumbers.length||1)]||fallback;
  let blocked=false;
  if(rotator.id&&rotator.userId){
    try{const claim=await claimRouterHandoff({...rotator,id:rotator.id,userId:rotator.userId});if(!claim.allowed)blocked=true;else number=claim.destination;}
    catch{console.warn("[router] metering unavailable; preserving public fallback");}
  }
  // Keep redirect outside the catch: Next redirects throw and must not be swallowed.
  if(blocked)redirect(`/router-limit?code=${encodeURIComponent(normalizedCode)}`);
  const target = new URL(`https://wa.me/${number || fallback}`);
  if (rotator.message) target.searchParams.set("text", rotator.message);
  redirect(target.toString());
}
