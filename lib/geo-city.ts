import 'server-only';
import fs from 'node:fs';
import { isIP } from 'node:net';
import { Reader, type Response } from 'maxmind';
import { countryForIp } from './site-country';

// City-level geo lookup for the Audience feature (owner decision: DB-IP's
// free "IP to City Lite" mmdb, CC BY 4.0 - attribution shown on the
// Audience card per db-ip.com's licence). The file is ~130MB unzipped, far
// too big for git, so it never ships in the repo: its path comes from
// GEOIP_CITY_DB_PATH (see .env.example and scripts/update-geoip-city.sh,
// which downloads/refreshes it on the server). If that env var is unset or
// the file can't be read, every lookup below just returns nulls - a click
// must never fail, slow down, or lose its redirect because of this file.
//
// The reader is opened lazily and cached; we re-stat the file at most once
// an hour (RECHECK_INTERVAL_MS) and only re-open it if its mtime changed,
// so the monthly cron update takes effect without a server restart but
// without stat-ing the file on every single click either.

type CityResponse = Response & {
  city?: { names?: Record<string, string> };
  subdivisions?: Array<{ names?: Record<string, string> }>;
  country?: { iso_code?: string };
};

const RECHECK_INTERVAL_MS = 60 * 60 * 1000;

let reader: Reader<CityResponse> | null = null;
let readerPath: string | null = null;
let readerMtimeMs = 0;
let lastStatCheckAt = 0;

function loadReader(): Reader<CityResponse> | null {
  const dbPath = process.env.GEOIP_CITY_DB_PATH;
  if (!dbPath) return null;

  const now = Date.now();
  const shouldRecheck = !reader || readerPath !== dbPath || now - lastStatCheckAt > RECHECK_INTERVAL_MS;
  if (!shouldRecheck) return reader;

  try {
    lastStatCheckAt = now;
    const stat = fs.statSync(dbPath);
    if (reader && readerPath === dbPath && stat.mtimeMs === readerMtimeMs) return reader;
    reader = new Reader<CityResponse>(fs.readFileSync(dbPath));
    readerPath = dbPath;
    readerMtimeMs = stat.mtimeMs;
    return reader;
  } catch {
    // Missing/unreadable file (not downloaded locally yet, bad path, etc.)
    // - keep whatever reader we already had (if any) rather than dropping it.
    return reader;
  }
}

/**
 * Country (ISO2) + city name for an IP, used only to derive the Audience
 * labels stored on a ConversationStart row - the IP itself is never kept.
 * Never throws. City comes from the DB-IP city DB when available, falling
 * back to the first subdivision name (e.g. "Maharashtra") when a city name
 * isn't recorded for that IP. Country prefers the city DB's own record, but
 * falls back to the existing country-only MaxMind DB (lib/site-country.ts)
 * when the city DB is unavailable or doesn't have a country for this IP.
 */
export function geoForIp(ip: string): { country: string | null; city: string | null } {
  try {
    const clean = ip.replace(/^::ffff:/, '');
    if (!isIP(clean)) return { country: null, city: null };

    const db = loadReader();
    if (!db) return { country: countryForIp(ip), city: null };

    const record = db.get(clean);
    const isoCode = record?.country?.iso_code;
    const country = isoCode && /^[A-Z]{2}$/.test(isoCode) ? isoCode : countryForIp(ip);
    // No city for this IP: use the state, labelled like link-generator ("Maharashtra Region").
    const region = record?.subdivisions?.[0]?.names?.en;
    const city = record?.city?.names?.en || (region ? `${region} Region` : null);
    return { country, city };
  } catch {
    return { country: null, city: null };
  }
}
