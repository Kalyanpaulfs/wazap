import type { Metadata } from "next";
import WorkspaceFrame from "../product/WorkspaceFrame";

export const metadata: Metadata = {
  title: "Conversion Reports",
  robots: { index: false, follow: false },
};

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
