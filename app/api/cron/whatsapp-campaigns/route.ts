import { NextResponse } from "next/server";
import { processWhatsAppCampaignBatch } from "@/lib/whatsapp-campaigns";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processWhatsAppCampaignBatch(50);
  return NextResponse.json({ ok: true, ...result });
}
