import { NextResponse } from "next/server";
import { requireOwnerTeam, originOk } from "@/lib/outreach/owner-request";
import { listLists, pauseList, reorderLists, deleteList } from "@/lib/outreach/lists";

export async function GET() {
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const lists = await listLists(ctx.ctx.team.id);
  return NextResponse.json({ lists });
}

// PATCH { id, paused: boolean } to pause/resume one list, or
// PATCH { reorder: string[] } to reorder every list.
export async function PATCH(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    if (Array.isArray(body.reorder)) {
      if (!body.reorder.every((id: unknown) => typeof id === "string")) return NextResponse.json({ error: "Invalid reorder list." }, { status: 400 });
      await reorderLists(ctx.ctx.team.id, body.reorder);
      return NextResponse.json({ success: true });
    }
    if (typeof body.id === "string" && typeof body.paused === "boolean") {
      await pauseList(ctx.ctx.team.id, body.id, body.paused);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await deleteList(ctx.ctx.team.id, body.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 404 });
  }
}
