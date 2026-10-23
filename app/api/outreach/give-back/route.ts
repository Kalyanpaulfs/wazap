import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OUTREACH_DEVICE_COOKIE, verifyDeviceToken } from "@/lib/outreach/device";
import { giveBack } from "@/lib/outreach/claim";

function originOk(req: Request) {
  return req.headers.get("origin") === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

// POST - salesperson "give back" their last contact (mis-tap), device-cookie authenticated.
export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const cookieStore = await cookies();
  const device = await verifyDeviceToken(cookieStore.get(OUTREACH_DEVICE_COOKIE)?.value);
  if (!device) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const result = await giveBack(device.memberId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
