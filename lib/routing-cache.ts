import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type CachedRoute = { code: string; numbers: string[]; pausedNumbers?: string[]; fallbackNumber?: string | null; message?: string | null; currentIdx: number; cachedAt: string };
const cacheDir = process.env.WAZAP_ROUTING_CACHE_DIR || "/opt/wazap-private/routing-cache";
const safeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
const fileFor = (code: string) => path.join(cacheDir, `${safeCode(code)}.json`);

// Best-effort: the cache is only a fallback for when the DB is down, so a
// cache write failure (e.g. unwritable dir) must never fail the request.
export async function cacheRoute(route: Omit<CachedRoute, "cachedAt">) {
  const code = safeCode(route.code);
  if (!code) return;
  try {
    await mkdir(cacheDir, { recursive: true });
    const target = fileFor(code);
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify({ ...route, code, cachedAt: new Date().toISOString() }), { mode: 0o600 });
    await rename(temp, target);
  } catch (error) {
    console.warn(`[routing-cache] could not cache ${code}:`, (error as Error)?.message ?? error);
  }
}

export async function readCachedRoute(code: string): Promise<CachedRoute | null> {
  try { return JSON.parse(await readFile(fileFor(code), "utf8")) as CachedRoute; } catch { return null; }
}

export async function removeCachedRoute(code: string) {
  await rm(fileFor(code), { force: true }).catch(() => {});
}
