import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AgentLaunchWizard from "./AgentLaunchWizard";

export const metadata: Metadata = {
  title: "Launch Marketplace Agent — Wazap",
  robots: { index: false, follow: false },
};

export default async function AgentLaunchPage({
  params,
}: {
  params: Promise<{ installId: string }>;
}) {
  if (!(await getServerSession(authOptions))?.user) redirect("/login");
  const { installId } = await params;
  return <AgentLaunchWizard installId={installId} />;
}
