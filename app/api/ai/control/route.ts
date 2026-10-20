import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RETIRED_RESPONSE = { error: "This feature has been retired." };

export async function GET() {
  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
}

