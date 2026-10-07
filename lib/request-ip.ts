export function requestIp(headers: Headers) {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 80);
  const forwarded = headers.get("x-forwarded-for")
    ?.split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return (forwarded?.at(-1) || "unknown").slice(0, 80);
}
