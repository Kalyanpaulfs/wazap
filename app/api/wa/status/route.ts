import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserWA } from "@/lib/wa-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wa = getUserWA((session.user as any).id as string);
  return NextResponse.json({
    status: wa.getStatus(),
    job: wa.getJob(),
  });
}
