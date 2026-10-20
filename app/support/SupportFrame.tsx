import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Navbar from "../Navbar";
import Footer from "../Footer";
import { AppShell } from "../product/AppFrame";

// Server-side frame for Help & support and the public tool pages (/tools,
// /qr): logged-in customers get the
// workspace sidebar, visitors get the public navbar + footer - decided
// before the page reaches the browser (see AppFrame serverFramedRoutes).
export default async function SupportFrame({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { name?: string | null; email?: string | null; isAdmin?: boolean } | undefined;
  if (!user) return <><Navbar />{children}<Footer /></>;
  return <AppShell user={{ name: user.name, email: user.email, isAdmin: user.isAdmin }}>{children}</AppShell>;
}
