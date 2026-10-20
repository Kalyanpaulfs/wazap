import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "./AppFrame";

// Server-side workspace frame for every private route (see AppFrame
// privateRoutes): the sidebar, the admin links and the top-bar name are
// rendered with the logged-in user before the page reaches the browser,
// so a refresh never flashes "My account" before the real name. With no
// session the page itself redirects to /login, so children render bare.
export default async function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { name?: string | null; email?: string | null; isAdmin?: boolean } | undefined;
  if (!user) return <>{children}</>;
  return <AppShell user={{ name: user.name, email: user.email, isAdmin: user.isAdmin }}>{children}</AppShell>;
}
