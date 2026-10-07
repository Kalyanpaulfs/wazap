import { createHash, randomBytes } from "crypto";

export const PARTNER_TERMS_VERSION = "2026-08-03";
export const PARTNER_ATTRIBUTION_WINDOW_DAYS = 30;
export const PARTNER_TOUCH_COOKIE = "wazap_partner_touch";

export function partnerToken() {
  return randomBytes(32).toString("base64url");
}

export function partnerTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function readPartnerTouchCookie(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === PARTNER_TOUCH_COOKIE) {
      try { return decodeURIComponent(value.join("=")).slice(0, 100); } catch { return ""; }
    }
  }
  return "";
}
