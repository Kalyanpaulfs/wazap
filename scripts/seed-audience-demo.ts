// Local-only demo data for the Audience feature (FEAT-AUDIENCE), so the
// owner can see the /results Audience card populated without waiting for
// real traffic. Adds ~60 ConversationStart rows over the last 14 days,
// with varied device/OS/country/city, attached to the local QA demo
// account's (qa-demo@wazap-qa.test) existing "Instagram bio - Support"
// lead rotator (or any account with --email=..., spread over all of that
// account's rotators, WhatsApp/Brand links and ad links). Every row this script creates is tagged source
// "audience-demo" so it can be found and removed again with --remove -
// never touches any other row.
//
// Usage:
//   npx tsx scripts/seed-audience-demo.ts            # add demo rows
//   npx tsx scripts/seed-audience-demo.ts --email=you@example.com
//   npx tsx scripts/seed-audience-demo.ts --remove    # delete them again (all accounts)
import { prisma } from "../lib/prisma";

const DEMO_SOURCE = "audience-demo";
const DEMO_EMAIL = process.argv.find(arg => arg.startsWith("--email="))?.slice("--email=".length) || "qa-demo@wazap-qa.test";
const ROW_COUNT = 60;
const DAYS_BACK = 14;

if (!process.env.DATABASE_URL?.includes("localhost")) {
  throw new Error("Refusing to run: DATABASE_URL is not a local database.");
}

// Devices/OS pairs seen on a typical small-business link - weighted so
// Mobile/Android dominates, like real WhatsApp-link traffic usually does.
const DEVICE_OS: Array<{ device: string; os: string }> = [
  { device: "Mobile", os: "Android" },
  { device: "Mobile", os: "Android" },
  { device: "Mobile", os: "Android" },
  { device: "Mobile", os: "iOS" },
  { device: "Mobile", os: "iOS" },
  { device: "Desktop", os: "Windows" },
  { device: "Desktop", os: "Mac OS" },
  { device: "Tablet", os: "Android" },
  { device: "Tablet", os: "iOS" },
  { device: "Desktop", os: "Linux" },
];

const GEO: Array<{ country: string | null; city: string | null }> = [
  { country: "IN", city: "Mumbai" },
  { country: "IN", city: "Mumbai" },
  { country: "IN", city: "Delhi" },
  { country: "IN", city: "Bengaluru" },
  { country: "US", city: "New York" },
  { country: "US", city: "Los Angeles" },
  { country: "GB", city: "London" },
  { country: "AE", city: "Dubai" },
  { country: null, city: null }, // geo lookup failed - shows as "Unknown"
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

async function seed() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (!user) throw new Error(`Demo account ${DEMO_EMAIL} not found - run the QA seed that creates it first.`);

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });
  if (!membership) throw new Error(`No workspace found for ${DEMO_EMAIL}.`);

  const [rotators, shortLinks, adLinks] = await Promise.all([
    prisma.rotatorLink.findMany({ where: { userId: user.id }, select: { id: true, name: true, numbers: true } }),
    prisma.shortLink.findMany({ where: { userId: user.id }, select: { id: true, name: true, phone: true } }),
    prisma.adLink.findMany({ where: { userId: user.id }, select: { id: true, name: true, number: true } }),
  ]);
  const assets = [
    ...rotators.map(link => ({ assetType: "rotator" as const, assetId: link.id, assetName: link.name, destinations: link.numbers.length ? link.numbers : ["919800000000"] })),
    ...shortLinks.map(link => ({ assetType: "short_link" as const, assetId: link.id, assetName: link.name, destinations: [link.phone] })),
    ...adLinks.map(link => ({ assetType: "ad_link" as const, assetId: link.id, assetName: link.name, destinations: [link.number] })),
  ];
  if (!assets.length) throw new Error(`No links found for ${DEMO_EMAIL} to attach demo rows to.`);

  const now = Date.now();

  const rows = Array.from({ length: ROW_COUNT }, () => {
    const asset = pick(assets);
    const { device, os } = pick(DEVICE_OS);
    const { country, city } = pick(GEO);
    const createdAt = new Date(now - Math.random() * DAYS_BACK * 86_400_000);
    return {
      userId: user.id,
      workspaceId: membership.workspaceId,
      assetType: asset.assetType,
      assetId: asset.assetId,
      assetName: asset.assetName,
      source: DEMO_SOURCE,
      destination: pick(asset.destinations),
      device,
      os,
      country,
      city,
      createdAt,
    };
  });

  await prisma.conversationStart.createMany({ data: rows });
  console.log(`Added ${rows.length} demo ConversationStart rows (source="${DEMO_SOURCE}") for ${DEMO_EMAIL} across ${assets.length} links.`);
}

async function remove() {
  const result = await prisma.conversationStart.deleteMany({ where: { source: DEMO_SOURCE } });
  console.log(`Removed ${result.count} demo ConversationStart rows (source="${DEMO_SOURCE}").`);
}

(process.argv.includes("--remove") ? remove() : seed())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
