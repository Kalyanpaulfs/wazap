import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log In",
  alternates: { canonical: "https://wazap.lt/login" },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
