import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

interface WaLink { label: string; number: string; note?: string; }

export default async function LinktreePublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await prisma.linktreePage.findUnique({ where: { slug } });
  if (!page) notFound();
  if (page.planPausedAt) redirect("/link-paused?type=linktree");

  await prisma.linktreePage.update({ where: { id: page.id }, data: { views: { increment: 1 } } });

  const links = page.links as unknown as WaLink[];

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-5">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white mx-auto mb-4 shadow-lg"
            style={{ backgroundColor: page.color }}>
            {page.title[0]?.toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold text-white">{page.title}</h1>
          {page.bio && <p className="text-slate-400 text-sm mt-2">{page.bio}</p>}
        </div>

        {/* Links */}
        {links.map((link, i) => {
          const url = `https://wa.me/${link.number.replace(/\D/g, "")}`;
          const trackedUrl = `/p/${encodeURIComponent(slug)}/${i}?to=${encodeURIComponent(url)}`;
          return (
            <a key={i} href={trackedUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-[#111811] hover:border-[#25D366]/50 px-5 py-4 transition-all hover:-translate-y-0.5 group">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: page.color + "30", border: `1.5px solid ${page.color}60` }}>
                <MessageCircle className="h-5 w-5" style={{ color: page.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold">{link.label}</p>
                {link.note && <p className="text-slate-500 text-xs mt-0.5">{link.note}</p>}
              </div>
              <span className="text-slate-500 group-hover:text-[#25D366] transition-colors text-lg">→</span>
            </a>
          );
        })}

        <div className="text-center pt-4">
          <Link href="/tools/linktree" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            Create your own at wazap.lt
          </Link>
        </div>
      </div>
    </div>
  );
}
