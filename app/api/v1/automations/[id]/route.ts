import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RETIRED_RESPONSE = { error: "This feature has been retired." };

export async function GET(
  _req: Request,
  _context: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
}

export async function PATCH(
  _req: Request,
  _context: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
}

export async function DELETE(
  _req: Request,
  _context: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
}

