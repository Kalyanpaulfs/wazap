import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { personalFacts, quickAnswersForTopic } from "@/lib/support-quick-answers";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const topic = cleanText(searchParams.get("topic"), 20);
  const quickAnswerId = cleanText(searchParams.get("quickAnswerId"), 60) || null;

  const answers = quickAnswersForTopic(topic).map(a => ({ id: a.id, title: a.title, body: a.body, action: a.action || null, urgent: Boolean(a.urgent) }));

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id || null;
  const personal = userId ? await personalFacts(userId, topic, quickAnswerId) : null;

  return NextResponse.json({ answers, personal }, { headers: { "Cache-Control": "no-store" } });
}
