import SupportFrame from "@/app/support/SupportFrame";
import SmartBackLink from "@/app/components/SmartBackLink";

// Logged-in customers read this page inside the workspace (sidebar, no
// dead end); visitors get the public navbar + footer.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SupportFrame><div className="wp-back mx-auto w-full max-w-4xl px-4 pt-6"><SmartBackLink /></div>{children}</SupportFrame>;
}
