import { NextResponse } from "next/server";
import { requireOwnerTeam, originOk } from "@/lib/outreach/owner-request";
import { listMembers, addMember, editMember, removeMember, logoutAllDevices } from "@/lib/outreach/members";

export async function GET() {
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const members = await listMembers(ctx.ctx.team.id);
  return NextResponse.json({ members });
}

export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.phone !== "string" || typeof body.email !== "string") {
    return NextResponse.json({ error: "Provide a name, phone number and email." }, { status: 400 });
  }
  // logoutDevices action (owner "log out all devices for this member").
  if (body.action === "logoutDevices") {
    if (typeof body.memberId !== "string") return NextResponse.json({ error: "Missing memberId." }, { status: 400 });
    try {
      await logoutAllDevices(ctx.ctx.team.id, body.memberId);
      return NextResponse.json({ success: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 404 });
    }
  }
  const result = await addMember(ctx.ctx.team.id, { name: body.name, phone: body.phone, email: body.email }, ctx.ctx.team.defaultCountry, ctx.ctx.memberLimit);
  if (!result.ok) return NextResponse.json({ error: result.error, upgrade: result.upgrade }, { status: 403 });
  return NextResponse.json({ member: result.member });
}

export async function PATCH(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.memberId !== "string") return NextResponse.json({ error: "Missing memberId." }, { status: 400 });
  try {
    await editMember(ctx.ctx.team.id, body.memberId, { name: typeof body.name === "string" ? body.name : undefined, email: typeof body.email === "string" ? body.email : undefined });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.memberId !== "string") return NextResponse.json({ error: "Missing memberId." }, { status: 400 });
  try {
    await removeMember(ctx.ctx.team.id, body.memberId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 404 });
  }
}
