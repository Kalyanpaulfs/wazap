"use client";

import { SessionProvider } from "next-auth/react";
import SiteLocaleProvider from "./localization/SiteLocale";
import AnalyticsConsent from "./components/AnalyticsConsent";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SiteLocaleProvider><SessionProvider>
      {children}
      <AnalyticsConsent />
    </SessionProvider></SiteLocaleProvider>
  );
}
