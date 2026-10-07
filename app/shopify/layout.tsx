import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";
export const metadata: Metadata = {
  title: "WhatsApp Tools for Shopify Stores",
  description:
    "Create WhatsApp product links, abandoned-cart recovery messages and order updates for Shopify stores without sharing store credentials.",
  alternates: { canonical: "https://wazap.lt/shopify" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="shopify" /></>;
}
