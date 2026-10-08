import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import copy from "@/lib/international-copy.json";
import { SITE_LANGUAGES, siteHreflang, NATIVE_LANGUAGE_NAMES, siteDirection, type SiteLanguage } from "@/lib/site-languages";

const BASE = "https://wazap.lt";
type Props = { params: Promise<{ language: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return SITE_LANGUAGES.map(language => ({ language })); }
function valid(language: string): language is SiteLanguage { return SITE_LANGUAGES.includes(language as SiteLanguage); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language } = await params;
  if (!valid(language)) notFound();
  const c = copy[language];
  const title = `Wazap — ${c.slice(0, 3).join(" ")}`;
  const url = `${BASE}/languages/${language}`;
  const languages = Object.fromEntries(SITE_LANGUAGES.map(code => [siteHreflang(code), `${BASE}/languages/${code}`]));
  return { title: { absolute: title }, description: c[3], alternates: { canonical: url, languages: { ...languages, "x-default": `${BASE}/languages/en` } }, openGraph: { title, description: c[3], url, locale: language }, twitter: { title, description: c[3] } };
}
export default async function LanguagePage({ params }: Props) {
  const { language } = await params;
  if (!valid(language)) notFound();
  const c = copy[language];
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: `Wazap — ${c.slice(0,3).join(" ")}`, description: c[3], url: `${BASE}/languages/${language}`, inLanguage: language, about: { "@type": "SoftwareApplication", name: "Wazap", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: BASE } };
  return <main lang={language} dir={siteDirection(language)} data-no-localize className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g,"\\u003c") }} />
    <p className="mb-5 text-sm text-emerald-400">Wazap · WhatsApp · {NATIVE_LANGUAGE_NAMES[language]}</p>
    <h1 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl">{c[0]} <span className="text-emerald-400">{c[1]}</span> {c[2]}</h1>
    <p className="mt-7 max-w-3xl text-lg leading-8 text-slate-300">{c[3]}</p>
    <div className="mt-8 flex flex-wrap gap-4"><Link href="/signup?redirect=/tools/rotator" className="rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-black">{c[18]}</Link><Link href="/pricing" className="rounded-xl border border-slate-600 px-6 py-3">{c[19]}</Link></div>
    <section className="my-16 grid gap-8 sm:grid-cols-3">{[4,6,8].map((i,index)=><article key={i} className="rounded-2xl border border-slate-800 p-6"><p className="mb-4 text-sm text-emerald-400">0{index+1}</p><h2 className="text-xl font-semibold">{c[i]}</h2><p className="mt-4 leading-7 text-slate-300">{c[i+1]}</p></article>)}</section>
    <section className="space-y-8">{[10,12,14,16].map(i=><article key={i}><h2 className="text-xl font-semibold">{c[i]}</h2><p className="mt-3 max-w-3xl leading-7 text-slate-300">{c[i+1]}</p></article>)}</section>
    <nav aria-label="Languages" className="mt-16 flex flex-wrap gap-x-5 gap-y-4 border-t border-slate-800 pt-8" dir="ltr" translate="no">{SITE_LANGUAGES.map(code=><Link key={code} href={`/languages/${code}`} hrefLang={siteHreflang(code)} lang={code} aria-current={code===language?'page':undefined} className={code===language?'text-emerald-400':'text-slate-400 hover:text-white'}>{NATIVE_LANGUAGE_NAMES[code]}</Link>)}</nav>
  </main>;
}
