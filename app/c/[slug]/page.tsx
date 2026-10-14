import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import CatalogOrderButton from "./CatalogOrderButton";

export const dynamic = "force-dynamic";

type Item = { name: string; price: string; desc: string };

export default async function CatalogPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = await prisma.catalogPage.findUnique({ where: { slug: slug.toLowerCase() } });
  if (!cat) notFound();
  if (cat.planPausedAt) redirect("/link-paused?type=catalog");

  prisma.catalogPage.update({ where: { id: cat!.id }, data: { views: { increment: 1 } } }).catch(() => {});
  const items = (Array.isArray(cat!.items) ? cat!.items : []) as unknown as Item[];

  return (
    <div className="min-h-screen bg-[#0a0f0a] text-white">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#25D366]/15 flex items-center justify-center mb-3">
            <MessageCircle className="h-7 w-7 text-[#25D366]" />
          </div>
          <h1 className="text-2xl font-bold">{cat!.title}</h1>
          {cat!.bio && <p className="text-slate-400 text-sm mt-1">{cat!.bio}</p>}
        </div>

        <div className="space-y-3">
          {items.map((it, i) => {
            return (
              <div key={i} className="rounded-2xl border border-slate-800 bg-[#111811] p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-white">{it.name}</div>
                  {it.desc && <div className="text-xs text-slate-400 mt-0.5">{it.desc}</div>}
                  {it.price && <div className="text-sm text-[#25D366] font-semibold mt-1">{it.price}</div>}
                </div>
                <CatalogOrderButton slug={cat!.slug} itemIndex={i} itemName={it.name} />
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <a href={`https://wa.me/${cat!.phone}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#25D366] hover:underline">Chat with us on WhatsApp →</a>
          <p className="mt-6 text-[11px] text-slate-600">Powered by <a href="https://wazap.lt" className="hover:text-slate-400">Wazap</a></p>
        </div>
      </div>
    </div>
  );
}
