import { NextResponse } from "next/server";
import { requireOwnerTeam, originOk } from "@/lib/outreach/owner-request";
import { previewListUpload, confirmListUpload } from "@/lib/outreach/lists";

// POST { name, csv, consent, dryRun: boolean, duplicateChoice?: "skip"|"include" }
// dryRun: true -> preview only (counts + rejected rows + already-contacted
// count), no DB write. dryRun: false -> creates the list.
export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.csv !== "string" || !body.csv.trim()) return NextResponse.json({ error: "Upload a CSV file." }, { status: 400 });

  try {
    if (body.dryRun !== false) {
      const preview = await previewListUpload(ctx.ctx.team.id, body.csv, ctx.ctx.team.defaultCountry, ctx.ctx.contactLimit);
      return NextResponse.json(preview);
    }
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Enter a list name." }, { status: 400 });
    const duplicateChoice: "skip" | "include" = body.duplicateChoice === "include" ? "include" : "skip";
    const result = await confirmListUpload(ctx.ctx.team.id, body.name, body.csv, ctx.ctx.team.defaultCountry, body.consent === true, duplicateChoice, ctx.ctx.contactLimit);
    if (!result.ok) return NextResponse.json({ error: result.error, upgrade: result.upgrade }, { status: 403 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read CSV." }, { status: 400 });
  }
}
