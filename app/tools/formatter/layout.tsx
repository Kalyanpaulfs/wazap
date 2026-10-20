import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

const description = "Add bold, italic, strikethrough and monospace to WhatsApp messages. Preview the result and copy it. Free and unlimited.";
export const metadata: Metadata = {
  title: "WhatsApp Text Formatter — Bold, Italic, Strikethrough",
  description,
  alternates: { canonical: "https://wazap.lt/tools/formatter" },
  openGraph: { title: "WhatsApp Text Formatter | Wazap", description, url: "https://wazap.lt/tools/formatter" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}
    <ToolSeo k="formatter" />
  </>;
}
