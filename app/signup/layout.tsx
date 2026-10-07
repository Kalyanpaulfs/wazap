import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
  alternates: { canonical: "https://wazap.lt/signup" },
  robots: { index: false, follow: true },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
