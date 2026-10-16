// Closes stale open chats: conversations with status "open" whose last
// message is older than 7 days. DRY RUN by default - only lists what it
// would close. Pass --apply to actually close them.
//
// This only ever runs against whatever DATABASE_URL points at (local
// wazap_dev in normal dev) - it never touches any other database, and it
// never reads/writes anything else.
//
// Usage:
//   npx tsx scripts/support-close-stale.ts           (dry run, lists only)
//   npx tsx scripts/support-close-stale.ts --apply   (actually closes them)
import { prisma } from "@/lib/prisma";

const STALE_DAYS = 7;

async function main() {
  const apply = process.argv.includes("--apply");
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400000);

  const stale = await prisma.supportConversation.findMany({
    where: { status: "open", lastMessageAt: { lt: cutoff } },
    select: { id: true, visitorId: true, name: true, email: true, subject: true, lastMessageAt: true },
    orderBy: { lastMessageAt: "asc" },
  });

  if (!stale.length) {
    console.log(`No open chats with a last message before ${cutoff.toISOString()}.`);
    return;
  }

  console.log(`${apply ? "Closing" : "[DRY RUN] Would close"} ${stale.length} chat(s) with no activity since before ${cutoff.toISOString()}:`);
  for (const chat of stale) {
    console.log(`  ${chat.id}  last message ${chat.lastMessageAt.toISOString()}  ${chat.name || "Visitor"} <${chat.email || "no email"}>  ${chat.subject}`);
  }

  if (!apply) {
    console.log("\nRe-run with --apply to close these.");
    return;
  }

  const result = await prisma.supportConversation.updateMany({
    where: { id: { in: stale.map(chat => chat.id) }, status: "open" },
    data: { status: "closed" },
  });
  console.log(`\nClosed ${result.count} chat(s).`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
