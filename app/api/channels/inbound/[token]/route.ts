import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RETIRED_RESPONSE = { error: "This feature has been retired." };

export async function POST(
  _req: Request,
  _context: { params: Promise<{ token: string }> }
) {
  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
}

