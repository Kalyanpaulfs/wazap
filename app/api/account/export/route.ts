import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildAccountExport } from "@/lib/account-lifecycle";
import { sharedRateLimit } from "@/lib/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await sharedRateLimit(`account-export:${userId}`, 3, 60 * 60_000)) {
    return NextResponse.json({ error: "Export limit reached. Please try again later." }, { status: 429 });
  }
  const data = await buildAccountExport(userId);
  if (!data) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="wazap-account-export-${date}.json"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
