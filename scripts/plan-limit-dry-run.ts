// Billing spec 12f/12g, step 7: READ-ONLY dry run of the plan-limit pause
// engine (lib/plan-limit-sync.ts). Prints, per live paid-or-was-paid user,
// which items would be plan-paused today and which plan-paused items would
// be resumed - WITHOUT writing anything. Run this against production
// before setting PLAN_LIMIT_PAUSING_ENABLED=true.
//
// Usage:
//   npx tsx scripts/plan-limit-dry-run.ts            (every user with any
//                                                      pausable item)
//   npx tsx scripts/plan-limit-dry-run.ts <userId>    (just one user)
// (Node 22+ can also run it directly with `node scripts/plan-limit-dry-run.ts`
// since this file uses only plain type annotations, no enums/namespaces.)
//
// Safety: this script never calls prisma.*.update/updateMany - it only calls
// inspectPlanLimitsForUser, which itself only calls syncPlanLimits's internal
// helpers with apply=false. Nothing it does can change data.
import { prisma } from "../lib/prisma";
import { inspectPlanLimitsForUser, type InspectTypeResult } from "../lib/plan-limit-sync";

type Section = { label: string; result: InspectTypeResult };

function printSection(section: Section) {
  const { label, result } = section;
  if (!result.pauseIds.length && !result.resumeIds.length) return;
  const bits: string[] = [];
  if (result.pauseIds.length) bits.push(`would PAUSE ${result.pauseIds.length} (limit ${result.limit}): ${result.pauseIds.join(", ")}`);
  if (result.resumeIds.length) bits.push(`would RESUME ${result.resumeIds.length} (limit ${result.limit}): ${result.resumeIds.join(", ")}`);
  console.log(`    ${label}: ${bits.join(" | ")}`);
}

async function labelsFor(table: "rotatorLink" | "shortLink" | "adLink" | "linktreePage" | "catalogPage", ids: string[], field: "name" | "title") {
  if (!ids.length) return new Map<string, string>();
  const delegate = (prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<Array<{ id: string; [key: string]: unknown }>> }>)[table];
  const rows = await delegate.findMany({ where: { id: { in: ids } }, select: { id: true, [field]: true } });
  return new Map(rows.map((row) => [row.id, String(row[field] ?? row.id)]));
}

async function run() {
  const onlyUserId = process.argv[2];
  const enabledNow = process.env.PLAN_LIMIT_PAUSING_ENABLED === "true";
  console.log(`Plan-limit pause dry run (read-only). PLAN_LIMIT_PAUSING_ENABLED=${enabledNow} (irrelevant to this report - it always simulates as if it were on).`);
  console.log("");

  const users = onlyUserId
    ? await prisma.user.findMany({ where: { id: onlyUserId }, select: { id: true, email: true, plan: true } })
    // Free-plan users are included too when they ever had a trial (trialEndsAt
    // set) - a lapsed trial can leave trial-era extras over the free plan's
    // real limits, so skipping plan "free" here would hide exactly that case.
    : await prisma.user.findMany({ where: { OR: [{ plan: { not: "free" } }, { trialEndsAt: { not: null } }] }, select: { id: true, email: true, plan: true }, orderBy: { createdAt: "asc" } });

  let usersWithChanges = 0;
  let totalPause = 0;
  let totalResume = 0;

  for (const user of users) {
    const report = await inspectPlanLimitsForUser(user.id);
    if (!report) continue;

    const flatSections: Section[] = [
      { label: "Rotators", result: report.rotators },
      { label: "Short links", result: report.shortLinks },
      { label: "Ad links", result: report.adLinks },
      { label: "Linktree pages", result: report.linktreePages },
      { label: "Catalog pages", result: report.catalogPages },
      ...report.workspaceMembers.map((result, i) => ({ label: `Workspace members [workspace ${i + 1}]`, result })),
      ...report.automations.map((result, i) => ({ label: `Automations [workspace ${i + 1}]`, result })),
      ...report.aiAgents.map((result, i) => ({ label: `AI agents [workspace ${i + 1}]`, result })),
      ...report.aiKnowledge.map((result, i) => ({ label: `AI knowledge [workspace ${i + 1}]`, result })),
      ...report.channels.map((result, i) => ({ label: `Channels [workspace ${i + 1}]`, result })),
      ...report.apiKeys.map((result, i) => ({ label: `API keys [workspace ${i + 1}]`, result })),
      ...report.webhooks.map((result, i) => ({ label: `Webhooks [workspace ${i + 1}]`, result })),
      ...report.marketplaceInstalls.map((result, i) => ({ label: `Marketplace installs [workspace ${i + 1}]`, result })),
    ];

    const changed = flatSections.filter((s) => s.result.pauseIds.length || s.result.resumeIds.length);
    if (!changed.length) continue;

    usersWithChanges++;
    for (const s of changed) {
      totalPause += s.result.pauseIds.length;
      totalResume += s.result.resumeIds.length;
    }

    console.log(`User ${user.id} (${user.email}, plan=${user.plan}, effective=${report.plan}):`);
    changed.forEach(printSection);

    // Resolve a couple of human-readable labels for the 5 link/page types,
    // since those ids alone aren't very recognizable - just enough to spot-check.
    for (const [table, field, result, title] of [
      ["rotatorLink", "name", report.rotators, "Rotators"],
      ["shortLink", "name", report.shortLinks, "Short links"],
      ["adLink", "name", report.adLinks, "Ad links"],
      ["linktreePage", "title", report.linktreePages, "Linktree pages"],
      ["catalogPage", "title", report.catalogPages, "Catalog pages"],
    ] as const) {
      const ids = [...result.pauseIds, ...result.resumeIds];
      if (!ids.length) continue;
      const labels = await labelsFor(table, ids, field);
      console.log(`    ${title} names: ${ids.map((id) => `${id}=${labels.get(id) ?? "?"}`).join(", ")}`);
    }
    console.log("");
  }

  console.log("---");
  console.log(`${users.length} user(s) checked, ${usersWithChanges} would change today: ${totalPause} item(s) would be paused, ${totalResume} would be resumed.`);
  console.log("No data was changed. Review this output before setting PLAN_LIMIT_PAUSING_ENABLED=true.");
}

run()
  .catch((err) => {
    console.error("[plan-limit-dry-run] failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
