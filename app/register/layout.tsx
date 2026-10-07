import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register",
  alternates: { canonical: "https://wazap.lt/register" },
  robots: { index: false, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
