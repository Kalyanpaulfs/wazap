import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTeamByCode, teamIsPaused } from "@/lib/outreach/team";
import { OUTREACH_DEVICE_COOKIE, verifyDeviceToken } from "@/lib/outreach/device";
import { claimNextContact } from "@/lib/outreach/claim";

// FEAT-QUEUE phase 3: this is the raw link shared to the team. A signed-in
// device that successfully claims a contact gets an instant 302 straight to
// WhatsApp (the fast path the owner asked for - no page render in between).
// Every other outcome (not signed in, team not found, paused, claim blocked)
// redirects to the real salesperson page at /team/<code>/home, which renders
// proper UI instead of the old bare placeholder HTML. That page re-derives
// "team not found" / "paused" / "removed" / "signed out" itself by looking
// the team/device up again, so this route only needs to forward the CLAIM-
// blocked reason (speed_limit/daily_cap/no_contacts) - the one thing only a
// claim attempt here can determine.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const homeUrl = (search?: Record<string, string>) => {
    const url = new URL(`/team/${code}/home`, req.url);
    for (const [k, v] of Object.entries(search ?? {})) url.searchParams.set(k, v);
    return url;
  };

  const found = await getTeamByCode(code);
  if (!found) return NextResponse.redirect(homeUrl());
  if (teamIsPaused(found.owner)) return NextResponse.redirect(homeUrl());

  const cookieStore = await cookies();
  const device = await verifyDeviceToken(cookieStore.get(OUTREACH_DEVICE_COOKIE)?.value);
  if (!device || device.teamId !== found.team.id) return NextResponse.redirect(homeUrl());

  const claim = await claimNextContact(device.memberId);
  if (!claim.ok) {
    const search: Record<string, string> = { blocked: claim.reason };
    if (claim.retryAfterMs) search.retryAfterMs = String(claim.retryAfterMs);
    return NextResponse.redirect(homeUrl(search));
  }
  return NextResponse.redirect(`https://wa.me/${claim.phone}`, { status: 302 });
}
