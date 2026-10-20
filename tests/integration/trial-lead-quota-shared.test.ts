// Integration test for audit item 12: the 3-day trial's 100-lead cap
// (TRIAL_ROUTED_LEADS) must be shared across rotator handoffs AND
// WhatsApp/brand short-link clicks (/w/[code]), not just rotators. Exercises
// the real claim functions (lib/router-claim.ts) against the local
// Postgres, pre-seeding ConversationStart rows to reach the boundary
// without 100 real DB round trips.
import { afterEach, describe, expect, it } from "vitest";
import { claimRouterHandoff, claimShortLinkHandoff, routerQuotaAllowed } from "@/lib/router-claim";
import { TRIAL_ROUTED_LEADS } from "@/lib/router-entitlements";
import { prisma } from "@/lib/prisma";
import { cleanupUser, createTestUser, daysFromNow, getWorkspaceId, uid } from "./helpers";

async function seedConversationStarts(userId: string, workspaceId: string, count: number, assetType: "rotator" | "short_link") {
  const rows = Array.from({ length: count }, () => ({
    userId, workspaceId, assetType, assetId: null, source: "seed", destination: "15550000000",
  }));
  await prisma.conversationStart.createMany({ data: rows });
}

describe("trial 100-lead cap is shared between rotator handoffs and short-link clicks", () => {
  const userIds: string[] = [];
  afterEach(async () => {
    for (const id of userIds.splice(0)) await cleanupUser(id);
  });

  it("a short-link click can push a trial user over the cap set by rotator handoffs, and vice versa", async () => {
    const user = await createTestUser({ plan: "free", trialStartedAt: new Date(), trialEndsAt: daysFromNow(3) });
    userIds.push(user.id);
    const workspaceId = await getWorkspaceId(user.id);

    const rotator = await prisma.rotatorLink.create({
      data: { userId: user.id, code: uid("rot"), name: "r", numbers: ["+10000000001"], fallbackNumber: "+10000000001" },
    });
    const shortLink = await prisma.shortLink.create({
      data: { userId: user.id, code: uid("sl"), name: "s", phone: "+10000000002" },
    });

    // 60 rotator handoffs + 39 short-link clicks already used = 99 total.
    await seedConversationStarts(user.id, workspaceId, 60, "rotator");
    await seedConversationStarts(user.id, workspaceId, TRIAL_ROUTED_LEADS - 60 - 1, "short_link");

    expect(await routerQuotaAllowed(user.id)).toBe(true);

    // The 100th lead, via the ROTATOR, should still be allowed.
    const rotatorClaim = await claimRouterHandoff({ id: rotator.id, userId: user.id, name: rotator.name, code: rotator.code, numbers: rotator.numbers, fallbackNumber: rotator.fallbackNumber, currentIdx: rotator.currentIdx });
    expect(rotatorClaim.allowed).toBe(true);

    // Now at exactly 100 used - the 101st, via the SHORT LINK, must be blocked.
    expect(await routerQuotaAllowed(user.id)).toBe(false);
    const shortLinkClaim = await claimShortLinkHandoff({ id: shortLink.id, userId: user.id, name: shortLink.name, code: shortLink.code, phone: shortLink.phone });
    expect(shortLinkClaim.allowed).toBe(false);

    // Confirm the short link's click/record were NOT written on a blocked claim.
    const reread = await prisma.shortLink.findUniqueOrThrow({ where: { id: shortLink.id } });
    expect(reread.clicks).toBe(0);
    const shortLinkStarts = await prisma.conversationStart.count({ where: { userId: user.id, assetType: "short_link", assetId: shortLink.id } });
    expect(shortLinkStarts).toBe(0);

    const totalUsed = await prisma.conversationStart.count({ where: { userId: user.id } });
    expect(totalUsed).toBe(TRIAL_ROUTED_LEADS);
  });

  it("routerQuotaAllowed (the over-speed-limit path) reflects the combined count, not just rotator", async () => {
    const user = await createTestUser({ plan: "free", trialStartedAt: new Date(), trialEndsAt: daysFromNow(3) });
    userIds.push(user.id);
    const workspaceId = await getWorkspaceId(user.id);

    // All 100 used leads are short-link clicks, zero rotator handoffs - the
    // shared cap must still trip.
    await seedConversationStarts(user.id, workspaceId, TRIAL_ROUTED_LEADS, "short_link");
    expect(await routerQuotaAllowed(user.id)).toBe(false);
  });
});
