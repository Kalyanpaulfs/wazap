import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) redirect("/login");
  redirect("/admin/crm");
}
