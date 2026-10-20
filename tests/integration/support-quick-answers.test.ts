// SUPPORT-2 personal-facts DB wrapper (lib/support-quick-answers.ts
// personalFacts) against the real local Postgres. The pure fact-builder
// (buildPersonalFacts) is unit-tested directly in
// lib/__tests__/support-quick-answers.test.ts; this covers the two things
// that only the DB wrapper can get wrong: excluding a refunded/non-charge
// Payment row, and separating plan-paused from customer-paused links.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { personalFacts } from "@/lib/support-quick-answers";
import { cleanupUser, createTestUser } from "./helpers";

describe("personalFacts (DB wrapper)", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) await cleanupUser(id);
  });

  it("ignores a refunded payment even though it was once activated", async () => {
    const user = await createTestUser({ plan: "free" });
    userIds.push(user.id);

    await prisma.payment.create({
      data: { userId: user.id, email: user.email, plan: "pro", amount: 19, currency: "USD", method: "dodo", status: "refunded", activatedAt: new Date() },
    });

    const facts = await personalFacts(user.id, "payment", null);
    expect(facts?.sentences.join(" ")).toContain("haven't confirmed a payment");
  });

  it("ignores a zero-amount payment row", async () => {
    const user = await createTestUser({ plan: "free" });
    userIds.push(user.id);

    await prisma.payment.create({
      data: { userId: user.id, email: user.email, plan: "pro", amount: 0, currency: "USD", method: "dodo", status: "active", activatedAt: new Date() },
    });

    const facts = await personalFacts(user.id, "payment", null);
    expect(facts?.sentences.join(" ")).toContain("haven't confirmed a payment");
  });

  it("uses a real successful charge (active/subscription_active, amount > 0) and formats its own currency", async () => {
    const user = await createTestUser({ plan: "pro", planExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
    userIds.push(user.id);

    await prisma.payment.create({
      data: { userId: user.id, email: user.email, plan: "pro", amount: 19, currency: "EUR", method: "dodo", status: "active", activatedAt: new Date() },
    });

    const facts = await personalFacts(user.id, "payment", null);
    expect(facts?.sentences.join(" ")).toContain("19");
    expect(facts?.sentences.join(" ")).not.toContain("$19");
  });

  it("separates plan-paused links from customer-paused links", async () => {
    const user = await createTestUser({ plan: "free" });
    userIds.push(user.id);

    await prisma.rotatorLink.create({
      data: { userId: user.id, code: `t_${randomUUID().slice(0, 8)}`, name: "Plan paused", numbers: ["911234567890"], planPausedAt: new Date() },
    });
    await prisma.rotatorLink.create({
      data: { userId: user.id, code: `t_${randomUUID().slice(0, 8)}`, name: "Customer paused", numbers: ["911234567891"], pausedAt: new Date() },
    });

    const facts = await personalFacts(user.id, "link", null);
    const joined = facts?.sentences.join(" ") || "";
    expect(joined).toContain("1 link is paused because of your plan");
    expect(joined).toContain("You paused 1 link yourself.");
  });
});
