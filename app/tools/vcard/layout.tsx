import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp vCard & QR Business Card Generator",
  description: "Create a digital WhatsApp business card in seconds. Download a .vcf contact file and custom QR code for business cards, websites and customer follow-ups.",
  keywords: ["whatsapp business card", "whatsapp vcard generator", "whatsapp qr code generator", "digital business card qr", "vcf download free", "whatsapp contact qr"],
  alternates: { canonical: "https://wazap.lt/tools/vcard" },
  openGraph: { title: "WhatsApp vCard + QR Generator — Digital Business Card — Wazap", description: "Create a digital business card and WhatsApp QR code in seconds. Download .vcf and QR PNG for free.", url: "https://wazap.lt/tools/vcard" },
};


export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="vcard" /></>;
}
