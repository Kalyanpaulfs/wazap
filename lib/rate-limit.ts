const map = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 20_000;
let cleanupAt = 0;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (now >= cleanupAt || map.size >= MAX_KEYS) {
    for (const [name, entry] of map) if (entry.resetAt <= now) map.delete(name);
    cleanupAt = now + 60_000;
  }
  if (!Number.isFinite(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1 || key.length > 512) return false;
  const entry = map.get(key);
  if (!entry || entry.resetAt <= now) {
    // Do not evict active buckets: that would let an attacker reset a limit.
    if (!entry && map.size >= MAX_KEYS) return false;
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
