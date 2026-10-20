import type { Metadata } from "next";
import WorkspaceFrame from "../product/WorkspaceFrame";

export const metadata: Metadata = {
  title: "Performance — Wazap",
  robots: { index: false, follow: false },
};

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
