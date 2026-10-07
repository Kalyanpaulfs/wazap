import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  if (!deep) {
    return NextResponse.json(
      { status: "ok", process: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const started = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("database timeout")), 1500)),
    ]);
    return NextResponse.json({ status: "ok", database: "ok", latencyMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable", latencyMs: Date.now() - started }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
