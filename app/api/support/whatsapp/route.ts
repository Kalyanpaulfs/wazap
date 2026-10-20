import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supportWhatsapp } from "@/lib/support-whatsapp";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id || null;
  return NextResponse.json(await supportWhatsapp(userId), { headers: { "Cache-Control": "no-store" } });
}
