import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Performance — Wazap",
  robots: { index: false, follow: false },
};

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
