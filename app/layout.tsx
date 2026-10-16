import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import "./design/home.css";
import "./design/system.css";
import SharedExperience from "./design/SharedExperience";
import Providers from "./Providers";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import Footer from "./Footer";
import AppFrame from "./product/AppFrame";
import "./product/product.css";
import ChatWidget from "./components/ChatWidget";
import VisitTracker from "./VisitTracker";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const BASE = "https://wazap.lt";
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Wazap",
  url: BASE,
  logo: `${BASE}/icon-512.png`,
  email: "hello@wazap.lt",
  sameAs: [
    "https://www.linkedin.com/company/wazaplt/",
    "https://www.instagram.com/wazaplt/",
  ],
};

export const viewport: Viewport = {
  themeColor: "#25D366",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  title: {
    default: "Wazap — WhatsApp Lead Router & Link Rotator",
    template: "%s | Wazap",
  },
  description: "Route WhatsApp leads fairly across your sales team with one trackable link. Round-robin lead distribution without API setup or QR scans.",
  keywords: [
    "whatsapp without saving number", "wa.me link generator", "open whatsapp without saving",
    "whatsapp lead router", "whatsapp link rotator", "whatsapp round robin", "whatsapp lead distribution",
    "whatsapp tools", "whatsapp qr code generator", "whatsapp click to chat",
    "click to whatsapp", "whatsapp business tools", "whatsapp widget",
    "whatsapp link rotator", "wazap",
  ],
  authors: [{ name: "Wazap", url: BASE }],
  creator: "Wazap",
  publisher: "Wazap",
  applicationName: "Wazap",
  category: "tools",
  alternates: { canonical: BASE },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/icon-192.png",
  },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Wazap" },
  openGraph: {
    type: "website",
    siteName: "Wazap",
    locale: "en_US",
    url: BASE,
    title: "Wazap — One WhatsApp Link, Every Lead Routed Fairly",
    description: "Distribute click-to-WhatsApp leads across your team automatically and track every routed conversation.",
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: "Wazap Business conversation platform" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@wazaplt",
    creator: "@wazaplt",
    title: "Wazap — WhatsApp Lead Router & Link Rotator",
    description: "One trackable link that distributes WhatsApp leads fairly across your team.",
    images: [`${BASE}/opengraph-image`],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[#0a0f0a] text-slate-200 antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c") }}
        />
        <Providers>
          <AppFrame footer={<Footer />}>{children}</AppFrame>
          <ChatWidget />
          <SharedExperience />
        </Providers>
        <ServiceWorkerRegister />
        <VisitTracker />
      </body>
    </html>
  );
}
