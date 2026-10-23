// TOOL-FREE-2: Google Safe Browsing v4 Lookup API (threatMatches:find) check
// for a link-shortener target URL. Kept separate from lib/short-url.ts so
// the pure, offline validation there stays trivially testable, while this
// file's network call is unit tested with a mocked fetch.
//
// Behaviour (owner spec, audit item 4c):
// - GOOGLE_SAFE_BROWSING_API_KEY unset: allow, log a warning ONCE per
//   server process (not once per request - that would spam the logs).
// - API call errors or exceeds the 3s timeout: allow (fail-open) and log.
//   This is deliberate: a Safe Browsing outage must never stop customers
//   from using the tool, and the other checks in lib/short-url.ts (no raw
//   IPs, no known shorteners, etc.) still apply regardless.
// - A real match: refuse with a plain message, no network data echoed back.
const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"] as const;
const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";

export type SafeBrowsingRequest = { endpoint: string; body: Record<string, unknown> };

export function buildSafeBrowsingRequest(url: string, apiKey: string): SafeBrowsingRequest {
  return {
    endpoint: `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    body: {
      client: { clientId: "wazap-link-shortener", clientVersion: "1.0.0" },
      threatInfo: {
        threatTypes: [...THREAT_TYPES],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    },
  };
}

export type SafeBrowsingVerdict =
  | { blocked: true; threatType?: string }
  | { blocked: false; failOpen?: boolean; reason?: string };

/** Pure response parser, unit tested directly with canned API payloads. */
export function parseSafeBrowsingResponse(json: unknown): SafeBrowsingVerdict {
  const matches = (json as { matches?: Array<{ threatType?: string }> } | null)?.matches;
  if (Array.isArray(matches) && matches.length > 0) {
    return { blocked: true, threatType: matches[0]?.threatType };
  }
  return { blocked: false };
}

let warnedMissingKey = false;
/** Test-only: lets lib/__tests__/safe-browsing.test.ts reset the "warned once" latch between cases. */
export function _resetSafeBrowsingWarningForTests() {
  warnedMissingKey = false;
}

export type SafeBrowsingFetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function checkSafeBrowsing(
  url: string,
  opts?: { apiKey?: string; fetchImpl?: SafeBrowsingFetch; timeoutMs?: number },
): Promise<SafeBrowsingVerdict> {
  const apiKey = opts?.apiKey ?? process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn("[safe-browsing] GOOGLE_SAFE_BROWSING_API_KEY is not set; link-shortener targets are not being checked against Google Safe Browsing.");
      warnedMissingKey = true;
    }
    return { blocked: false, failOpen: true, reason: "no_api_key" };
  }

  const fetchImpl = opts?.fetchImpl ?? (fetch as unknown as SafeBrowsingFetch);
  const { endpoint, body } = buildSafeBrowsingRequest(url, apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 3000);
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[safe-browsing] API returned HTTP ${res.status}; allowing the link (fail-open).`);
      return { blocked: false, failOpen: true, reason: `http_${res.status}` };
    }
    return parseSafeBrowsingResponse(await res.json());
  } catch (err) {
    console.warn("[safe-browsing] request failed or timed out; allowing the link (fail-open).", err instanceof Error ? err.message : err);
    return { blocked: false, failOpen: true, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}
