import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Wazap — Sales, Support and Product Help",
  description: "Contact the Wazap team for account or billing help, product support, security reports, partnership questions, integrations and feature requests.",
  alternates: { canonical: "https://wazap.lt/contact" },
  openGraph: {
    title: "Contact Wazap",
    description: "Reach out to the Wazap team for support or enquiries.",
    url: "https://wazap.lt/contact",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
