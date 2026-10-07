import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {sameSiteRequest} from "@/lib/crm";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const body = await req.json().catch(()=>({}));
  if (!body.messageId || typeof body.read !== "boolean") return NextResponse.json({ error: "Invalid message update." }, { status: 400 });
  const message = await prisma.contactMessage.update({ where: { id: String(body.messageId) }, data: { read: body.read } });
  return NextResponse.json({ id: message.id, read: message.read });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const body = await req.json().catch(()=>({}));
  if (!body.messageId) return NextResponse.json({ error: "Missing message." }, { status: 400 });
  await prisma.contactMessage.delete({ where: { id: String(body.messageId) } });
  return NextResponse.json({ success: true });
}
