import ToolSeo from "@/app/ToolSeo";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="qr" /></>;
}
