import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { flaggedConversationCount } from "@/lib/support-admin-service";

// Lightweight poll target for the "Support" nav badge (CrmNavigation) - kept
// separate from the main /api/admin/support GET so the badge doesn't pull
// the full inbox payload every ~20s.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ count: await flaggedConversationCount() }, { headers: { "Cache-Control": "no-store" } });
}
