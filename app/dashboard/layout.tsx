import type { Metadata } from "next";
import WorkspaceFrame from "../product/WorkspaceFrame";

export const metadata: Metadata = {
  title: "Dashboard",
  alternates: { canonical: "https://wazap.lt/dashboard" },
  robots: { index: false, follow: true },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
