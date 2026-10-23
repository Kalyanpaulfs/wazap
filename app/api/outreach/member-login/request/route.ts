import { NextResponse } from "next/server";
import { requestIp } from "@/lib/request-ip";
import { isPlausibleE164Digits } from "@/lib/phone";
import { getTeamByCode, teamIsPaused } from "@/lib/outreach/team";
import { requestMemberLoginCode } from "@/lib/outreach/login";

function originOk(req: Request) {
  return req.headers.get("origin") === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

// POST { code, phone } - public (salesperson-side), same-site only. Always
// returns the same neutral shape whether or not the phone belongs to a
// member - see lib/outreach/login.ts.
export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { code?: unknown; phone?: unknown };
  const code = String(body.code ?? "").trim();
  const phoneDigits = String(body.phone ?? "").replace(/\D/g, "");
  if (!code) return NextResponse.json({ error: "Missing team link." }, { status: 400 });
  if (!isPlausibleE164Digits(phoneDigits)) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

  const found = await getTeamByCode(code);
  if (!found) return NextResponse.json({ error: "Team link not found." }, { status: 404 });
  if (teamIsPaused(found.owner)) return NextResponse.json({ error: "This team link isn't active right now." }, { status: 403 });

  const ip = requestIp(req.headers);
  const result = await requestMemberLoginCode(found.team.id, phoneDigits, ip);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ sent: true, message: result.message, maskedEmail: result.maskedEmail });
}
