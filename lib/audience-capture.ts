import 'server-only';
import { detectDevice } from './audience';
import { geoForIp } from './geo-city';
import type { AudienceFields } from './conversations';

/**
 * One call for the 3 click routes (app/r/[code], app/w/[code], app/a/[id]):
 * turns the request headers + already-resolved client IP into the small
 * set of derived labels recordConversationStart/claimRouterHandoff/
 * claimShortLinkHandoff store. Never throws and never slows the redirect -
 * detectDevice is a pure regex match and geoForIp is an in-memory mmdb
 * lookup, but this is wrapped defensively anyway so a bad header or a
 * corrupt geo DB can never break routing. Bot clicks still get a device
 * ("Bot") so the Audience aggregation can exclude them, but no geo lookup
 * is bothered with for them.
 */
export function captureAudience(headers: Headers, ip: string): AudienceFields {
  try {
    const { device, os, isBot } = detectDevice(headers.get('user-agent'), headers.get('sec-ch-ua-platform'));
    const { country, city } = isBot ? { country: null, city: null } : geoForIp(ip);
    return { device, os, country, city };
  } catch {
    return { device: null, os: null, country: null, city: null };
  }
}
