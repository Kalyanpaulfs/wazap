import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { ensurePersonalWorkspace } from "@/lib/workspaces";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { effectivePlan } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

type Item = { name?: string; price?: string };

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanPhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 15);
}

function leadLimit(plan: string) {
  const normalized = plan === "business" ? "ultimate" : plan;
  return (TOOL_LIMITS.leads[normalized as keyof typeof TOOL_LIMITS.leads] ?? TOOL_LIMITS.leads.free).uses;
}

function targetUrl(phone: string, item: Item) {
  const message = `Hi! I'd like to order: ${item.name}${item.price ? ` (${item.price})` : ""}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`catalog-order:${ip}`, 20, 60_000)) {
    return NextResponse.redirect(new URL(`/c/${url.searchParams.get("slug") ?? ""}`, url.origin), 307);
  }
  const slug = (url.searchParams.get("slug") ?? "").toLowerCase();
  const itemIndex = Number.parseInt(url.searchParams.get("item") ?? "", 10);
  const catalog = await prisma.catalogPage.findUnique({ where: { slug } });
  if (!catalog || !Number.isInteger(itemIndex)) {
    return NextResponse.redirect(new URL("/tools/catalog", url.origin), 307);
  }
  const items = (Array.isArray(catalog.items) ? catalog.items : []) as Item[];
  const item = items[itemIndex];
  if (!item?.name) return NextResponse.redirect(new URL(`/c/${slug}`, url.origin), 307);

  const membership = await ensurePersonalWorkspace(catalog.userId);
  await prisma.$transaction([
    prisma.catalogOrder.create({
      data: {
        catalogPageId: catalog.id,
        userId: catalog.userId,
        itemName: String(item.name).slice(0, 80),
        itemPrice: String(item.price ?? "").slice(0, 30),
      },
    }),
    prisma.conversationStart.create({
      data: {
        userId: catalog.userId,
        workspaceId: membership.workspaceId,
        assetType: "catalog",
        assetId: catalog.id,
        assetName: catalog.title,
        source: "Wazap catalog",
        campaign: String(item.name).slice(0, 80),
        destination: catalog.phone,
      },
    }),
  ]);

  return NextResponse.redirect(targetUrl(catalog.phone, item), 307);
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`catalog-capture:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many inquiries. Please wait a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const slug = cleanText(body.slug, 100).toLowerCase();
  const itemIndex = Number.parseInt(String(body.item ?? ""), 10);
  const customerName = cleanText(body.name, 100);
  const customerPhone = cleanPhone(body.phone);
  const customerEmail = cleanText(body.email, 160).toLowerCase();
  if (!slug || !Number.isInteger(itemIndex) || !customerName || customerPhone.length < 7 || body.consent !== true) {
    return NextResponse.json({ error: "Your name, valid contact number, and consent are required." }, { status: 400 });
  }

  const catalog = await prisma.catalogPage.findUnique({
    where: { slug },
    include: { user: { select: { plan: true, trialPlan: true, trialEndsAt: true } } },
  });
  if (!catalog) return NextResponse.json({ error: "Catalog not found." }, { status: 404 });
  const membership = await ensurePersonalWorkspace(catalog.userId);
  const owner = await prisma.user.findUnique({ where: { id: membership.workspace.ownerId }, select: { plan: true, trialPlan: true, trialEndsAt: true } });
  const items = (Array.isArray(catalog.items) ? catalog.items : []) as Item[];
  const item = items[itemIndex];
  if (!item?.name) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const existingLead = await prisma.lead.findFirst({
    where: {
      workspaceId: membership.workspaceId,
      phone: customerPhone,
      archivedAt: null,
      status: { notIn: ["won", "lost"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  const limit = leadLimit(effectivePlan(owner ?? catalog.user));
  const activeLeadCount = existingLead || limit === -1
    ? 0
    : await prisma.lead.count({ where: { workspaceId: membership.workspaceId, archivedAt: null, status: { notIn: ["won", "lost"] } } });
  const canCreateLead = Boolean(existingLead) || limit === -1 || activeLeadCount < limit;

  const result = await prisma.$transaction(async (tx) => {
    let leadId = existingLead?.id ?? null;
    if (existingLead) {
      await tx.lead.update({
        where: { id: existingLead.id },
        data: {
          name: customerName,
          email: customerEmail || existingLead.email,
          source: "Wazap catalog",
          campaign: catalog.title,
          nextFollowUpAt: new Date(),
          activities: { create: { type: "catalog_inquiry", body: `Asked about ${cleanText(item.name, 80)}` } },
        },
      });
    } else if (canCreateLead) {
      const lead = await tx.lead.create({
        data: {
          userId: catalog.userId,
          workspaceId: membership.workspaceId,
          name: customerName,
          phone: customerPhone,
          email: customerEmail || null,
          source: "Wazap catalog",
          campaign: catalog.title,
          nextFollowUpAt: new Date(),
          notes: `Interested in ${cleanText(item.name, 80)}${item.price ? ` · ${cleanText(item.price, 30)}` : ""}`,
          activities: { create: { type: "captured", body: `Captured from ${catalog.title}` } },
        },
      });
      leadId = lead.id;
    }

    const order = await tx.catalogOrder.create({
      data: {
        catalogPageId: catalog.id,
        userId: catalog.userId,
        leadId,
        itemName: cleanText(item.name, 80),
        itemPrice: cleanText(item.price, 30),
        customerName,
        customerPhone,
        customerEmail: customerEmail || null,
      },
    });
    await tx.conversationStart.create({
      data: {
        userId: catalog.userId,
        workspaceId: membership.workspaceId,
        leadId,
        assetType: "catalog",
        assetId: catalog.id,
        assetName: catalog.title,
        source: "Wazap catalog",
        campaign: cleanText(item.name, 80),
        destination: catalog.phone,
      },
    });
    const inboxText = `Catalog inquiry: ${cleanText(item.name, 80)}${item.price ? ` (${cleanText(item.price, 30)})` : ""}`;
    const inboxConversation = await tx.inboxConversation.upsert({
      where: { workspaceId_channel_contactAddress: { workspaceId: membership.workspaceId, channel: "whatsapp", contactAddress: customerPhone } },
      update: { contactName: customerName, leadId, status: "open", resolvedAt: null, unreadCount: { increment: 1 }, lastMessageAt: new Date(), lastMessagePreview: inboxText },
      create: { workspaceId: membership.workspaceId, leadId, channel: "whatsapp", contactName: customerName, contactAddress: customerPhone, unreadCount: 1, lastMessagePreview: inboxText, tags: ["catalog"] },
    });
    await tx.inboxMessage.create({ data: { conversationId: inboxConversation.id, direction: "inbound", senderType: "customer", text: inboxText, deliveryStatus: "received" } });
    await tx.inboxEvent.create({ data: { workspaceId: membership.workspaceId, conversationId: inboxConversation.id, type: "catalog_inquiry", metadata: { catalogId: catalog.id, orderId: order.id } } });
    return { orderId: order.id, leadId, inboxConversationId: inboxConversation.id };
  });
  await enqueueWebhookEvent(membership.workspaceId, "message.recorded", { conversationId: result.inboxConversationId, direction: "inbound", source: "catalog", orderId: result.orderId });

  return NextResponse.json({
    ...result,
    captured: Boolean(result.leadId),
    targetUrl: targetUrl(catalog.phone, item),
  });
}
