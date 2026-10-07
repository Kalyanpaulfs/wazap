import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversion Reports — Wazap",
  robots: { index: false, follow: false },
};

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
