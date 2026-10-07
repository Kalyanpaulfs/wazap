import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Consent-Based WhatsApp Bulk Sender — No API Required",
  description:
    "Paste or privately import an opted-in CSV/TXT contact list, personalize messages and open WhatsApp chats one at a time for human review. No API required.",
  keywords: [
    "WhatsApp bulk sender",
    "send WhatsApp messages without API",
    "WhatsApp contact queue",
    "personalized WhatsApp messages",
  ],
  alternates: { canonical: "https://wazap.lt/tools/bulk" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Consent-Based WhatsApp Bulk Sender — Wazap",
    description:
      "Prepare an opted-in contact queue and open each personalized WhatsApp chat for review and sending.",
    url: "https://wazap.lt/tools/bulk",
  },
};

export default function BulkLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
