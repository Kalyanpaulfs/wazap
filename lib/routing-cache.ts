import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type CachedRoute = { code: string; numbers: string[]; fallbackNumber?: string | null; currentIdx: number; cachedAt: string };
const cacheDir = process.env.WAZAP_ROUTING_CACHE_DIR || "/opt/wazap-routing-cache";
const safeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
const fileFor = (code: string) => path.join(cacheDir, `${safeCode(code)}.json`);

export async function cacheRoute(route: Omit<CachedRoute, "cachedAt">) {
  const code = safeCode(route.code);
  if (!code) return;
  await mkdir(cacheDir, { recursive: true });
  const target = fileFor(code);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ ...route, code, cachedAt: new Date().toISOString() }), { mode: 0o600 });
  await rename(temp, target);
}

export async function readCachedRoute(code: string): Promise<CachedRoute | null> {
  try { return JSON.parse(await readFile(fileFor(code), "utf8")) as CachedRoute; } catch { return null; }
}

export async function removeCachedRoute(code: string) {
  await rm(fileFor(code), { force: true }).catch(() => {});
}
