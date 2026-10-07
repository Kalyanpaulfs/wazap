import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AcceptInvitationButton from "./AcceptInvitationButton";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { token }, include: { workspace: { select: { name: true } } } });
  const session = await getServerSession(authOptions);
  const valid = invitation?.status === "pending" && invitation.expiresAt > new Date();
  return <main className="hero-bg min-h-[75vh] px-4 py-20"><div className="mx-auto max-w-lg rounded-3xl border border-[#25D366]/25 bg-[#0d150d] p-8 text-center">
    <p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">Wazap workspace</p>
    <h1 className="mt-4 text-3xl font-bold text-white">{valid ? `Join ${invitation.workspace.name}` : "Invitation unavailable"}</h1>
    <p className="mt-3 text-slate-400">{valid ? `This secure invitation is for ${invitation.email} and expires ${invitation.expiresAt.toLocaleDateString()}.` : "This invitation has expired, was cancelled, or has already been used."}</p>
    {valid && !session?.user && <div className="mt-7 flex justify-center gap-3"><Link href={`/login?redirect=/workspace/invite/${token}`} className="rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-black">Sign in</Link><Link href={`/signup?redirect=/workspace/invite/${token}`} className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-white">Create account</Link></div>}
    {valid && session?.user && <AcceptInvitationButton token={token} />}
    {!valid && <Link href="/workspace" className="mt-7 inline-block text-sm font-semibold text-[#25D366]">Open your workspaces →</Link>}
  </div></main>;
}
