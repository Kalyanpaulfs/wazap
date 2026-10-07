import type { Metadata } from "next";

export const metadata: Metadata = { title: "Shared Inbox — Wazap", description: "Manage business conversations, assignments, notes and tasks in one team inbox.", robots: { index: false, follow: false } };
export default function InboxLayout({ children }: { children: React.ReactNode }) { return children; }
