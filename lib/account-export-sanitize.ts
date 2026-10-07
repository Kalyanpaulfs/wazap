const SECRET_EXPORT_KEYS = new Set([
  "secret", "password", "authorization", "accesstoken", "refreshtoken", "token",
  "apikey", "clientsecret", "privatekey", "signingsecret", "webhookpathtoken",
  "keyhash", "idempotencykeyhash", "idempotencyrequesthash", "secretencrypted",
  "signingsecretencrypted", "accesstokenencrypted",
]);

function redactExportUrl(value: string) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return value;
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (SECRET_EXPORT_KEYS.has(normalized)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function sanitizeAccountExport(value: unknown, key = ""): unknown {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (SECRET_EXPORT_KEYS.has(normalized) || normalized.endsWith("encrypted")) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string" && ["url", "website", "sourceurl", "landingpage"].includes(normalized)) return redactExportUrl(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeAccountExport(item)).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([childKey, childValue]) => {
      const sanitized = sanitizeAccountExport(childValue, childKey);
      return sanitized === undefined ? [] : [[childKey, sanitized]];
    }));
  }
  return value;
}
