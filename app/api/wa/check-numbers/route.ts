import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserWA } from "@/lib/wa-manager";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wa = getUserWA((session.user as any).id as string);
  if (wa.getStatus() !== "connected") {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  const { numbers } = (await req.json().catch(() => ({}))) as { numbers?: string[] };
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return NextResponse.json({ error: "no numbers" }, { status: 400 });
  }

  try {
    const results = await wa.checkNumbers(numbers.slice(0, 500));
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
