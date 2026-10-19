import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildPublicUrl, originBase, LINK_KIND_NAME, type LinkKind } from "@/lib/my-links";
import { kindFromCreatedType, buildCreatedUrl, type CreatedLinkType } from "@/lib/link-create-forms";
import BackLink from "@/app/links/BackLink";
import CreatedActions from "./CreatedActions";

export const metadata = { title: "Link created — Wazap", robots: { index: false, follow: false } };

// Honest, per-type note about what happens if you use "Test it now" -
// rotators actually route a live chat (and spend a trial lead), unlike a
// brand/ad link where opening it is just a tracked click. See
// app/r/[code]/route.ts claimRouterHandoff for why the rotator case is
// different.
const TEST_NOTE: Record<LinkKind, string> = {
  rotator: "Heads up: opening this sends a real chat to a salesperson and counts as one routed lead (on a trial, it uses one of your 100 trial leads).",
  shortlink: "Opening this counts as a click in your stats, like a real visitor's would.",
  adlink: "Opening this counts as a click in your stats, like a real visitor's would.",
};

export default async function LinkCreatedPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  const sp = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const back = sp.type && sp.id ? buildCreatedUrl(sp.type as CreatedLinkType, sp.id) : "/links";
    redirect(`/login?redirect=${encodeURIComponent(back)}`);
  }
  const userId = (session.user as { id: string }).id;

  const kind = kindFromCreatedType(sp.type);
  const id = (sp.id || "").trim();
  if (!kind || !id) notFound();

  let name: string;
  let publicUrl: string;
  if (kind === "rotator") {
    const row = await prisma.rotatorLink.findFirst({ where: { id, userId }, select: { name: true, code: true } });
    if (!row) notFound();
    name = row.name;
    publicUrl = buildPublicUrl(originBase(), "rotator", { code: row.code });
  } else if (kind === "shortlink") {
    const row = await prisma.shortLink.findFirst({ where: { id, userId }, select: { name: true, code: true } });
    if (!row) notFound();
    name = row.name;
    publicUrl = buildPublicUrl(originBase(), "shortlink", { code: row.code });
  } else {
    const row = await prisma.adLink.findFirst({ where: { id, userId }, select: { name: true, number: true, message: true } });
    if (!row) notFound();
    name = row.name;
    publicUrl = buildPublicUrl(originBase(), "adlink", { id, number: row.number, message: row.message });
  }

  const kindName = LINK_KIND_NAME[kind];
  const kindNameLower = kindName.charAt(0).toLowerCase() + kindName.slice(1);

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <div className="text-left">
          <BackLink href="/links" label="My links" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#25D366]">{kindName} created</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Your {kindNameLower} is ready</h1>
          <p className="mt-1 text-slate-400">{name}</p>
        </div>

        <div className="break-all rounded-2xl border border-slate-800 bg-[#111811] px-5 py-4 font-mono text-base text-white sm:text-lg">
          {publicUrl.replace(/^https?:\/\//, "")}
        </div>

        <CreatedActions publicUrl={publicUrl} name={name} testNote={TEST_NOTE[kind]} />

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-sm font-semibold">
          <Link href={`/links/${sp.type}/${id}`} className="text-slate-300 hover:text-white">
            View link details
          </Link>
          <Link href="/links" className="text-slate-300 hover:text-white">
            Go to My links
          </Link>
          <Link href="/links/new" className="text-[#25D366] hover:underline">
            Create another
          </Link>
        </div>
      </div>
    </main>
  );
}
