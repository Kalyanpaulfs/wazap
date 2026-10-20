import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import WorkspaceFrame from "../product/WorkspaceFrame";

export const metadata: Metadata = {
  title: "Admin",
  alternates: { canonical: "https://wazap.lt/admin" },
  robots: { index: false, follow: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!(session.user as {isAdmin?:boolean}).isAdmin) redirect("/dashboard");
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
