import { NextResponse } from "next/server";
import { requestIp } from "@/lib/request-ip";
import { isPlausibleE164Digits } from "@/lib/phone";
import { getTeamByCode, teamIsPaused } from "@/lib/outreach/team";
import { verifyMemberLoginCode } from "@/lib/outreach/login";
import { OUTREACH_DEVICE_COOKIE, outreachDeviceCookieOptions } from "@/lib/outreach/device";

function originOk(req: Request) {
  return req.headers.get("origin") === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

// POST { code, phone, otp } - verifies the 6-digit code and, on success,
// sets the ~90-day device cookie (lib/outreach/device.ts).
export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { code?: unknown; phone?: unknown; otp?: unknown };
  const code = String(body.code ?? "").trim();
  const phoneDigits = String(body.phone ?? "").replace(/\D/g, "");
  const otp = String(body.otp ?? "").trim();
  if (!code) return NextResponse.json({ error: "Missing team link." }, { status: 400 });
  if (!isPlausibleE164Digits(phoneDigits)) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

  const found = await getTeamByCode(code);
  if (!found) return NextResponse.json({ error: "Team link not found." }, { status: 404 });
  if (teamIsPaused(found.owner)) return NextResponse.json({ error: "This team link isn't active right now." }, { status: 403 });

  const ip = requestIp(req.headers);
  const result = await verifyMemberLoginCode(found.team.id, phoneDigits, otp, ip);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const response = NextResponse.json({ success: true });
  response.cookies.set(OUTREACH_DEVICE_COOKIE, result.token, outreachDeviceCookieOptions);
  return response;
}
