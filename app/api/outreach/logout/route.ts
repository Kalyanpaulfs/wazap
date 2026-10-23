import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OUTREACH_DEVICE_COOKIE, revokeDeviceToken } from "@/lib/outreach/device";

function originOk(req: Request) {
  return req.headers.get("origin") === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

// POST - salesperson's own "log out this device". Revokes the device row
// (not just clearing the cookie) so a stolen cookie value can't be reused.
export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const cookieStore = await cookies();
  const token = cookieStore.get(OUTREACH_DEVICE_COOKIE)?.value;
  if (token) await revokeDeviceToken(token);
  const response = NextResponse.json({ success: true });
  response.cookies.set(OUTREACH_DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
