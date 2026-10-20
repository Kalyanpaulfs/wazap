"use client";

import { formatLocalPrice, useLocalization } from "@/app/pricing/local-price";

// A USD amount shown in the visitor's estimated local currency, for server
// components (e.g. the Free trial card) that can't call useLocalization.
export default function LocalPrice({ usd }: { usd: number }) {
  return <>{formatLocalPrice(usd, useLocalization())}</>;
}
