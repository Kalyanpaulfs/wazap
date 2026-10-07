import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import WhatsAppPlatformClient from "./WhatsAppPlatformClient";
export const metadata = { title: "WhatsApp Platform — Wazap", robots: { index: false, follow: false } };
export default async function Page() {
  if (!(await getServerSession(authOptions))?.user) redirect("/login?redirect=/whatsapp");
  return <WhatsAppPlatformClient />;
}
