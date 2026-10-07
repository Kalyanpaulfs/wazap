import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentAiContext } from "@/lib/ai-agents";
import { cleanInboxText } from "@/lib/inbox";

export async function GET() {
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const knowledge = await prisma.aiKnowledge.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ knowledge, limit: ctx.knowledgeLimit });
}

export async function POST(req: Request) {
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const count = await prisma.aiKnowledge.count({ where: { workspaceId: ctx.workspaceId, status: "active" } });
  if (count >= ctx.knowledgeLimit) return NextResponse.json({ error: `Your plan supports ${ctx.knowledgeLimit} active knowledge entries.`, upgrade: true }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const title = cleanInboxText(body.title, 120); const content = cleanInboxText(body.content, 20_000);
  if (!title || content.length < 10) return NextResponse.json({ error: "A title and useful knowledge content are required." }, { status: 400 });
  const item = await prisma.aiKnowledge.create({ data: { workspaceId: ctx.workspaceId, title, content, sourceType: body.sourceUrl ? "url_reference" : "text", sourceUrl: cleanInboxText(body.sourceUrl, 500) || null } });
  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})); const existing = await prisma.aiKnowledge.findFirst({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Knowledge entry not found." }, { status: 404 });
  const item = await prisma.aiKnowledge.update({ where: { id: existing.id }, data: { ...(body.title !== undefined ? { title: cleanInboxText(body.title, 120) } : {}), ...(body.content !== undefined ? { content: cleanInboxText(body.content, 20_000) } : {}), ...(body.status === "active" || body.status === "archived" ? { status: body.status } : {}) } });
  return NextResponse.json({ success: true, item });
}

export async function DELETE(req: Request) {
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})); const result = await prisma.aiKnowledge.deleteMany({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId } });
  if (!result.count) return NextResponse.json({ error: "Knowledge entry not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
