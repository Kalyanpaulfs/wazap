import { NextResponse } from "next/server";
import { requireOwnerTeam, originOk } from "@/lib/outreach/owner-request";
import { addContact } from "@/lib/outreach/lists";

// BUG C: POST { phone, name?, notes?, consent: boolean, listId? | newListName? }
// Adds ONE customer by hand - either into an existing list (listId) or a
// brand new one (newListName). Exactly one of listId/newListName is
// required. Mirrors app/api/outreach/members/route.ts's add-one-member POST.
export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.phone !== "string" || !body.phone.trim()) {
    return NextResponse.json({ error: "Enter a phone number." }, { status: 400 });
  }
  const listId = typeof body.listId === "string" && body.listId ? body.listId : undefined;
  const newListName = typeof body.newListName === "string" ? body.newListName : undefined;
  if (!listId && !newListName?.trim()) {
    return NextResponse.json({ error: "Choose a list, or name a new one." }, { status: 400 });
  }

  const result = await addContact(
    ctx.ctx.team.id,
    {
      phone: body.phone,
      name: typeof body.name === "string" ? body.name : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      listId,
      newListName,
    },
    ctx.ctx.team.defaultCountry,
    body.consent === true,
    ctx.ctx.contactLimit
  );
  if (!result.ok) return NextResponse.json({ error: result.error, upgrade: result.upgrade }, { status: 403 });
  return NextResponse.json(result);
}
