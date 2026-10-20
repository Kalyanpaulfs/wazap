import ToolSeo from "@/app/ToolSeo";
import SupportFrame from "@/app/support/SupportFrame";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SupportFrame>{children}<ToolSeo k="qr" /></SupportFrame>;
}
