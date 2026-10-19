"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Sets a `tz` cookie to the browser's IANA timezone on first load (and
 * whenever it's missing/stale), then refreshes so the server can bucket
 * /results' days and periods in the viewer's local time instead of UTC.
 * Renders nothing; a no-op once the cookie already matches.
 */
export default function TzSync() {
  const router = useRouter();

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const match = document.cookie.match(/(?:^|; )tz=([^;]*)/);
      const current = match ? decodeURIComponent(match[1]) : null;
      if (current !== tz) {
        document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }
    } catch {
      // Intl/cookies unavailable (e.g. very old browser) - keep the UTC default.
    }
  }, [router]);

  return null;
}
