import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { sharedRateLimit, sharedRateLimitExceeded } from "./shared-rate-limit";
import { sendEmail, renderEmailCodeEmail } from "./email";

// Passwordless sign-in and step-up confirmation via a 6-digit email code.
// Codes are single-use, expire after 10 minutes, allow 5 wrong guesses, and
// only an HMAC of the code is stored.
export type EmailCodePurpose = "login" | "confirm";

export const EMAIL_CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const TWELVE_HOURS = 12 * 60 * 60_000;
// Wrong guesses allowed per IP in 12 hours before that IP is blocked for the
// rest of the window. Blocks scripts without locking out the real owner.
const IP_WRONG_GUESS_LIMIT = 10;
export const BLOCKED_MESSAGE = "Too many wrong codes from your network. Please try again in 12 hours, or continue with Google.";

export async function ipBlockedForCodes(ip: string): Promise<boolean> {
  return sharedRateLimitExceeded(`email-code-wrong-ip:${ip}`, IP_WRONG_GUESS_LIMIT);
}

export async function recordWrongCode(ip: string): Promise<void> {
  await sharedRateLimit(`email-code-wrong-ip:${ip}`, IP_WRONG_GUESS_LIMIT, TWELVE_HOURS);
}

export function normalizeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase().slice(0, 320);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function codeHash(email: string, purpose: EmailCodePurpose, code: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");
  return createHmac("sha256", secret).update(`email-code:${purpose}:${email}:${code}`).digest("hex");
}

export type IssueResult = { ok: true } | { ok: false; status: number; error: string };

export async function issueEmailCode(email: string, purpose: EmailCodePurpose, ip: string): Promise<IssueResult> {
  if (await ipBlockedForCodes(ip)) return { ok: false, status: 429, error: BLOCKED_MESSAGE };
  if (!await sharedRateLimit(`email-code-ip:${ip}`, 20, 15 * 60_000)) return { ok: false, status: 429, error: "Too many code requests. Please wait 15 minutes." };
  if (!await sharedRateLimit(`email-code-email:${purpose}:${email}`, 5, 15 * 60_000)) return { ok: false, status: 429, error: "Too many codes sent to this email. Please wait 15 minutes." };
  if (!await sharedRateLimit(`email-code-email-12h:${purpose}:${email}`, 10, TWELVE_HOURS)) return { ok: false, status: 429, error: "Too many codes sent to this email today. Please try again in 12 hours, or continue with Google." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60_000);
  const record = await prisma.$transaction(async tx => {
    await tx.emailCode.updateMany({ where: { email, purpose, usedAt: null }, data: { usedAt: new Date() } });
    return tx.emailCode.create({ data: { email, purpose, codeHash: codeHash(email, purpose, code), expiresAt } });
  });

  if (process.env.NODE_ENV === "development" && process.env.dev_otp === "true" && purpose === "login") {
    await prisma.emailCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return { ok: true };
  }

  // Local development only: Brevo accepts sends from the server's authorised IP,
  // so print the code instead of emailing it. Never active in production.
  if (process.env.NODE_ENV !== "production" && process.env.EMAIL_CODE_DEV_LOG === "true") {
    console.log(`[email-code] DEV ONLY: ${purpose} code for ${email} is ${code}`);
    return { ok: true };
  }

  const subject = purpose === "login" ? `${code} is your Wazap sign-in code` : `${code} is your Wazap confirmation code`;
  const sent = await sendEmail({ to: email, subject, html: renderEmailCodeEmail({ code, purpose, minutes: EMAIL_CODE_TTL_MINUTES }), channel: "support" });
  if (!sent.accepted) {
    await prisma.emailCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    console.error("[email-code] delivery failed", sent.provider, sent.error);
    return { ok: false, status: 503, error: "We could not send the code right now. Please try again in a minute." };
  }
  return { ok: true };
}

export type CodeCheck = { ok: true; id: string } | { ok: false; reason: "expired" | "locked" } | { ok: false; reason: "wrong"; remaining: number };

// Checks a code without consuming it, counting wrong guesses. Returns the code
// id when valid so the caller can consume it once every other check passes.
export async function checkEmailCodeDetailed(email: string, purpose: EmailCodePurpose, code: string): Promise<CodeCheck> {
  const clean = String(code ?? "").replace(/\s/g, "");
  const record = email ? await prisma.emailCode.findFirst({
    where: { email, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  }) : null;
  if (!record) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  if (/^\d{6}$/.test(clean)) {
    const expected = Buffer.from(record.codeHash, "hex");
    const actual = Buffer.from(codeHash(email, purpose, clean), "hex");
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return { ok: true, id: record.id };
  }
  const updated = await prisma.emailCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } }, select: { attempts: true } });
  const remaining = Math.max(0, MAX_ATTEMPTS - updated.attempts);
  return remaining ? { ok: false, reason: "wrong", remaining } : { ok: false, reason: "locked" };
}

export async function checkEmailCode(email: string, purpose: EmailCodePurpose, code: string): Promise<string | null> {
  const result = await checkEmailCodeDetailed(email, purpose, code);
  return result.ok ? result.id : null;
}

// Atomically marks a checked code as used; false if it was used concurrently.
export async function consumeEmailCode(id: string): Promise<boolean> {
  const claimed = await prisma.emailCode.updateMany({
    where: { id, usedAt: null, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1;
}

export async function verifyEmailCode(email: string, purpose: EmailCodePurpose, code: string, ip?: string): Promise<boolean> {
  if (ip && await ipBlockedForCodes(ip)) return false;
  const id = await checkEmailCode(email, purpose, code);
  if (!id && ip) await recordWrongCode(ip);
  return id ? consumeEmailCode(id) : false;
}
