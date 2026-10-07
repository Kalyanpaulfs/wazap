import type { Metadata } from "next";
export const metadata: Metadata = { title: "AI Employees — Wazap", description: "Configure AI employee profiles, knowledge, approval policies, and human handoffs.", robots: { index: false, follow: false } };
export default function AiAgentsLayout({ children }: { children: React.ReactNode }) { return children; }
