// Local-only demo data for Team outreach (FEAT-QUEUE), so Kalyan can click
// through /outreach and /team/<code> without building a team by hand.
// Creates (or reuses) the local QA demo account's (qa-demo@wazap-qa.test)
// one OutreachTeam, 5 salespeople, and one 30-customer list, then simulates
// some claim/give-back activity so the Report tab has something to show.
// Every row this script creates can be found again by team code (printed at
// the end) and removed with --remove - never touches any other account's
// data.
//
// Usage:
//   npx tsx scripts/seed-outreach-demo.ts              # add demo data
//   npx tsx scripts/seed-outreach-demo.ts --email=you@example.com
//   npx tsx scripts/seed-outreach-demo.ts --remove     # delete this account's team
import { prisma } from "../lib/prisma";
import { linkPlan } from "../lib/router-entitlements";
import { teamOutreachAvailable, teamOutreachContactLimit, teamOutreachMemberLimit } from "../lib/plan-limits";
import { createTeamForOwner, OWNER_PLAN_SELECT } from "../lib/outreach/team";
import { addMember } from "../lib/outreach/members";
import { confirmListUpload } from "../lib/outreach/lists";

const DEMO_EMAIL = process.argv.find((arg) => arg.startsWith("--email="))?.slice("--email=".length) || "qa-demo@wazap-qa.test";
const CONTACT_COUNT = 30;

if (!process.env.DATABASE_URL?.includes("localhost")) {
  throw new Error("Refusing to run: DATABASE_URL is not a local database.");
}

const MEMBERS = [
  { name: "Priya Sharma", phone: "+971501234501", email: "priya.demo@example.test" },
  { name: "Rahul Verma", phone: "+971501234502", email: "rahul.demo@example.test" },
  { name: "Sara Haddad", phone: "+971501234503", email: "sara.demo@example.test" },
  { name: "Omar Khalil", phone: "+971501234504", email: "omar.demo@example.test" },
  { name: "Li Wei", phone: "+971501234505", email: "liwei.demo@example.test" },
];

function customersCsv(count: number): string {
  const rows = ["phone,name,notes"];
  for (let i = 0; i < count; i++) {
    const phone = `+97150000${String(1000 + i)}`;
    rows.push(`${phone},Customer ${i + 1},Demo row`);
  }
  return rows.join("\n");
}

async function seed() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true, ...OWNER_PLAN_SELECT } });
  if (!user) throw new Error(`Demo account ${DEMO_EMAIL} not found - run the QA seed that creates it first.`);

  const plan = linkPlan(user);
  if (!teamOutreachAvailable(plan)) {
    console.warn(`NOTE: ${DEMO_EMAIL} resolves to plan "${plan}", which is NOT Growth/Agency - Team outreach is locked for this account. Seeding anyway (useful for the DB rows), but /outreach will show the locked/upgrade state until the plan is changed.`);
  }

  const teamResult = await createTeamForOwner(user.id);
  if (!teamResult.ok) throw new Error(teamResult.error);
  const team = teamResult.team;

  const memberLimit = teamOutreachMemberLimit(plan);
  const contactLimit = teamOutreachContactLimit(plan);

  const createdMembers: { name: string; phone: string; email: string }[] = [];
  for (const m of MEMBERS) {
    const result = await addMember(team.id, m, team.defaultCountry, memberLimit);
    if (!result.ok) {
      // Already added by a previous run of this script - fine, keep going.
      console.log(`Skipped ${m.name} (${result.error})`);
      continue;
    }
    createdMembers.push(m);
  }

  const members = await prisma.outreachMember.findMany({ where: { teamId: team.id }, orderBy: { createdAt: "asc" } });
  if (!members.length) throw new Error("No members on this team - cannot simulate report activity.");

  // One 30-customer list (confirmListUpload is idempotent-ish: running it
  // again just creates a second list, so skip if a "Demo customers" list
  // already exists for this team).
  const existingList = await prisma.outreachList.findFirst({ where: { teamId: team.id, name: "Demo customers" } });
  let list = existingList;
  if (!list) {
    const csv = customersCsv(CONTACT_COUNT);
    const upload = await confirmListUpload(team.id, "Demo customers", csv, team.defaultCountry, true, "include", contactLimit);
    if (!upload.ok) throw new Error(upload.error);
    list = await prisma.outreachList.findUniqueOrThrow({ where: { id: upload.listId } });

    // Simulate some claim history so the Report tab (today / 7d / all time,
    // give-backs, "many customers in a few minutes" / "many give-backs"
    // flags) has something to show straight away, without waiting for real
    // clicks. Bypasses claimNextContact's locking on purpose - this is
    // offline seeding, not a concurrent-safety test (see
    // tests/integration/outreach-claim.test.ts for that).
    const contacts = await prisma.outreachContact.findMany({ where: { listId: list.id }, orderBy: { createdAt: "asc" } });
    const now = Date.now();
    let givenCount = 0;

    // 10 contacts given out across the week, spread over the 5 members.
    for (let i = 0; i < 10; i++) {
      const contact = contacts[i];
      const member = members[i % members.length];
      const givenAt = new Date(now - Math.floor(Math.random() * 6) * 86_400_000 - Math.random() * 3_600_000);
      await prisma.outreachContact.update({ where: { id: contact.id }, data: { givenToMemberId: member.id, givenAt } });
      givenCount++;
    }
    // 5 more given out TODAY so the "today" column isn't empty, with a
    // burst on one member (8 within a few minutes) to show the "many
    // customers in a few minutes" flag.
    const burstMember = members[0];
    for (let i = 10; i < 18; i++) {
      const contact = contacts[i];
      const givenAt = new Date(now - i * 20_000); // 20s apart - inside the burst window
      await prisma.outreachContact.update({ where: { id: contact.id }, data: { givenToMemberId: burstMember.id, givenAt } });
      givenCount++;
    }
    // 2 of the week's given contacts were given back (free again) -
    // exercises STEP 0a/0b: list.givenCount decremented, member.giveBackCount
    // incremented.
    for (let i = 0; i < 2; i++) {
      const contact = contacts[i];
      await prisma.outreachContact.update({ where: { id: contact.id }, data: { givenBackAt: new Date(), givenBackByMemberId: members[i].id } });
      givenCount--;
      await prisma.outreachMember.update({ where: { id: members[i].id }, data: { giveBackCount: { increment: 1 } } });
    }
    // Bump one member's give-back count further (no matching contacts
    // needed - it's a standalone lifetime counter) so the "many give-backs"
    // owner-report flag has an example to show.
    await prisma.outreachMember.update({ where: { id: members[1].id }, data: { giveBackCount: { increment: 6 } } });

    await prisma.outreachList.update({ where: { id: list.id }, data: { givenCount } });
  } else {
    console.log(`Reusing existing "Demo customers" list (${list.id}).`);
  }

  console.log("\nTeam outreach demo data ready.");
  console.log(`  Owner:      ${DEMO_EMAIL} (plan: ${plan})`);
  console.log(`  Team code:  ${team.code}`);
  console.log(`  Team link:  http://localhost:3000/team/${team.code}`);
  console.log(`  Members (${members.length}):`);
  for (const m of members) console.log(`    - ${m.name}  phone=+${m.phone}  email=${m.email}`);
  console.log(`  List: "Demo customers" - ${CONTACT_COUNT} customers`);
  console.log(`\nOpen http://localhost:3000/outreach while signed in as ${DEMO_EMAIL} to click through.`);
}

async function remove() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (!user) {
    console.log(`No account ${DEMO_EMAIL} found - nothing to remove.`);
    return;
  }
  const team = await prisma.outreachTeam.findUnique({ where: { userId: user.id } });
  if (!team) {
    console.log(`No team found for ${DEMO_EMAIL} - nothing to remove.`);
    return;
  }
  // Cascades delete members/devices/lists/contacts (see prisma/schema.prisma onDelete: Cascade).
  await prisma.outreachTeam.delete({ where: { id: team.id } });
  console.log(`Removed the team outreach demo team (and its members/lists/contacts) for ${DEMO_EMAIL}.`);
}

(process.argv.includes("--remove") ? remove() : seed())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
