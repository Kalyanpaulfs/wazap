import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidBrandSlug } from "@/lib/link-create-forms";

export const dynamic = "force-dynamic";

// GET /api/shortlinks/check?slug=acme - live availability check for the
// brand link create form (UX-1 step 3). Authenticated only, read-only,
// never reserves the slug - app/api/shortlinks POST still re-checks and is
// the only place a slug is actually claimed.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("slug") ?? "";
  const slug = raw.trim().toLowerCase();
  const valid = isValidBrandSlug(slug);
  if (!valid) return NextResponse.json({ available: false, valid: false });

  const existing = await prisma.shortLink.findUnique({ where: { code: slug }, select: { id: true } });
  return NextResponse.json({ available: !existing, valid: true });
}
