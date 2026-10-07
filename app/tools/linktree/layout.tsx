import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatsApp Linktree — Free Multi-Number Page Builder",
  description:
    "Create one free page for multiple WhatsApp numbers, teams, departments, or languages. Share a clean WhatsApp Linktree with one simple URL.",
  keywords: [
    "WhatsApp Linktree",
    "linktree for WhatsApp",
    "multiple WhatsApp numbers",
    "WhatsApp team link",
  ],
  alternates: { canonical: "https://wazap.lt/tools/linktree" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "WhatsApp Linktree — One Link for Your Whole Team",
    description:
      "Put multiple WhatsApp contacts on one clean, shareable page for teams, departments, and languages.",
    url: "https://wazap.lt/tools/linktree",
  },
};

export default function LinktreeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
