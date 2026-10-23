// TOOL-FREE-2: Link shortener - free tool that shortens ANY website URL
// (not WhatsApp; Wazap already has WhatsApp links /w, rotator /r, ad links
// /a). This file holds the pure, unit-tested pieces: target-URL safety
// validation, code generation and the public-URL helpers. The Google Safe
// Browsing check lives in lib/safe-browsing.ts (separate because it talks
// to the network); the report/auto-disable rules live in
// lib/short-url-reports.ts.
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

// Confusable characters (0/O, 1/I/l) are left out so a code read aloud or
// handwritten from a flyer isn't ambiguous.
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
// Spec calls for a "6-7 char code" - 7 is used for every generated code
// (within that range, and the extra character meaningfully lowers the
// collision rate at scale); a caller can still request 6 explicitly.
const DEFAULT_CODE_LENGTH = 7;

export function randomShortCode(length: number = DEFAULT_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// Custom "name" a signed-in user can pick instead of a random code - it
// becomes the code itself (e.g. wazap.lt/s/my-sale), so it is validated
// like a URL slug, not a free-text title.
const CUSTOM_CODE_RE = /^[a-z0-9-]{3,40}$/;

// Reserved so a custom code can never collide with a real route under /s/*
// (the dynamic [code] route would otherwise "win" and shadow these pages).
export const RESERVED_SHORT_CODES = new Set(["report", "unavailable", "new", "api"]);

export function isValidCustomCode(code: string): boolean {
  return CUSTOM_CODE_RE.test(code) && !RESERVED_SHORT_CODES.has(code);
}

// Chain-hiding prevention (audit item 4b): a handful of well-known public
// shorteners a bad actor could nest behind our own link to hide the real
// destination from the Safe Browsing check and from anyone previewing it.
export const BLOCKED_SHORTENER_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "is.gd",
  "ow.ly",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
  "rb.gy",
];

export function shortLinkBaseUrl(): string {
  const raw = process.env.SHORT_LINK_BASE_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // Fall through to the default below on a misconfigured value.
    }
  }
  return new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

export function buildShortUrlPublicUrl(code: string): string {
  return `${shortLinkBaseUrl()}/s/${code}`;
}

export type TargetUrlValidation = { ok: true; url: URL } | { ok: false; error: string };

/**
 * Pure safety validation for a link-shortener target URL (audit item 4b).
 * Does NOT make a network call - see lib/safe-browsing.ts for the Google
 * Safe Browsing lookup, which runs separately after this passes.
 */
export function validateTargetUrl(input: string, opts?: { ownHost?: string }): TargetUrlValidation {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter a URL to shorten." };
  if (trimmed.length > 2048) return { ok: false, error: "That URL is too long (2048 characters max)." };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a valid web address, like https://example.com." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// links are allowed." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Links with a username or password aren't allowed." };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, error: "Enter a valid web address." };

  if (isIP(host)) {
    return { ok: false, error: "Links to a raw IP address aren't allowed." };
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, error: "Local addresses aren't allowed." };
  }

  const ownHost = (opts?.ownHost ?? new URL(shortLinkBaseUrl()).hostname).toLowerCase();
  if (host === ownHost) {
    return { ok: false, error: "You can't shorten a link that already points to one of our own short links." };
  }

  const bareHost = host.replace(/^www\./, "");
  if (BLOCKED_SHORTENER_HOSTS.includes(bareHost)) {
    return { ok: false, error: "Links to other link shorteners aren't allowed, to stop a link hiding its real destination." };
  }

  return { ok: true, url };
}
