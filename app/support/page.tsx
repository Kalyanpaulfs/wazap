import type { Metadata } from "next";
import SupportClient from "./SupportClient";

export const metadata: Metadata = {
  title: "Customer Support — Accounts and Billing",
  description: "Get help with Wazap account access, billing, lead-routing workflows, and product issues.",
  alternates: { canonical: "https://wazap.lt/support" },
};

export default function SupportPage() {
  return <SupportClient />;
}
