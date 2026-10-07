import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DISABLED_RESPONSE = {
  error: "This endpoint is disabled. Wazap provides click-to-chat productivity tools and does not support bulk messaging.",
};

export async function POST() {
  return NextResponse.json(DISABLED_RESPONSE, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json(DISABLED_RESPONSE, { status: 410 });
}

export async function GET() {
  return NextResponse.json(DISABLED_RESPONSE, { status: 410 });
}
