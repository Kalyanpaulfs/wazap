import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "./theme/base.css";
import "./theme/utilities.css";
import SharedExperience from "./design/SharedExperience";
import Providers from "./Providers";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import AppFrame from "./product/AppFrame";
import "./product/product.css";
import ChatWidget from "./components/ChatWidget";
import VisitTracker from "./VisitTracker";
import { themeScript } from "./theme/theme-script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0F14" },
  ],
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
      { url: "/icon.svg?v=20261015", type: "image/svg+xml" },
      { url: "/icon-192.png?v=20261015", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=20261015", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=20261015", sizes: "180x180" }],
    shortcut: "/favicon.ico?v=20261015",
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
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c") }}
        />
        <Providers>
          <AppFrame>{children}</AppFrame>
          <ChatWidget />
          <SharedExperience />
        </Providers>
        <ServiceWorkerRegister />
        <VisitTracker />
      </body>
    </html>
  );
}
