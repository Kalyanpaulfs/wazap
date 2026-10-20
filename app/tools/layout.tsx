import SupportFrame from "@/app/support/SupportFrame";

// Logged-in customers get the workspace sidebar, visitors the public
// navbar + footer - chosen on the server (no refresh flash).
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <SupportFrame>{children}</SupportFrame>;
}
