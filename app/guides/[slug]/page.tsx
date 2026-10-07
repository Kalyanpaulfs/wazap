import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GrowthArticle from "@/app/components/GrowthArticle";
import { growthArticles, growthPath } from "@/lib/growth-content";
const category = "guides";
export function generateStaticParams() { return growthArticles.filter(a=>a.category===category).map(a=>({slug:a.slug})); }
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{ const {slug}=await params;const a=growthArticles.find(a=>a.category===category&&a.slug===slug);if(!a)return {};const url=`https://wazap.lt${growthPath(a)}`;const seoTitle=a.slug==="whatsapp-round-robin-routing"?"WhatsApp Round-Robin Routing Guide":a.slug==="whatsapp-campaign-tracking"?"Track WhatsApp Campaigns: Clicks, Leads & Sales":a.title;return {title:seoTitle,description:a.description,alternates:{canonical:url},openGraph:{title:a.title,description:a.description,url,type:"article"}}; }
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const article=growthArticles.find(a=>a.category===category&&a.slug===slug);if(!article)notFound();return <GrowthArticle article={article}/>;}
