import {captureCrmLead} from "@/lib/crm";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { notifySupportMessage } from "@/lib/support-notify";

const SUBJECTS = new Set(["general", "billing", "account", "tool", "feature", "migration", "integration", "business", "other"]);
function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(`contact:${ip}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many messages. Please wait before sending again." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const name = clean(body.name, 120);
  const email = clean(body.email, 255).toLowerCase();
  const subject = clean(body.subject, 40);
  const message = clean(body.message, 5000);
  if (!name || !email || !subject || !message) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!SUBJECTS.has(subject)) return NextResponse.json({ error: "Choose a valid support topic." }, { status: 400 });
  if (!rateLimit(`contact-email:${email}`, 3, 60 * 60 * 1000)) return NextResponse.json({ error: "Too many messages for this email. Please wait before sending again." }, { status: 429 });

  const cleanMessage = { name, email, subject, message };

  const created = await prisma.$transaction(async tx=>{const contact=await tx.contactMessage.create({data:cleanMessage});const lead=await captureCrmLead(tx,{name,email,source:"contact_form"});await tx.crmActivity.create({data:{leadId:lead.id,kind:"enquiry",body:`${subject}: ${message}`,sourceKey:`contact:${contact.id}`}});return contact;});
  await notifySupportMessage(cleanMessage);

  return NextResponse.json({ ok: true, requestId: created.id }, { status: 201 });
}
