import { NextResponse } from "next/server";
import { requireOwnerTeam, originOk } from "@/lib/outreach/owner-request";
import { previewMembersImport, confirmMembersImport } from "@/lib/outreach/members";

// POST { csv: string, confirm?: boolean } - dry-run preview by default;
// confirm: true actually creates the members (mirrors lists/upload's
// dry-run -> confirm shape).
export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.csv !== "string" || !body.csv.trim()) return NextResponse.json({ error: "Upload a CSV file." }, { status: 400 });

  try {
    if (body.confirm === true) {
      const result = await confirmMembersImport(ctx.ctx.team.id, body.csv, ctx.ctx.team.defaultCountry, ctx.ctx.memberLimit);
      return NextResponse.json(result);
    }
    const preview = await previewMembersImport(ctx.ctx.team.id, body.csv, ctx.ctx.team.defaultCountry);
    return NextResponse.json(preview);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read CSV." }, { status: 400 });
  }
}
