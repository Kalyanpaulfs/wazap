// FEAT-QUEUE: salesperson first-device login. Reuses lib/email-code.ts as
// much as possible (same 6-digit code, 10 min expiry, 5 wrong guesses, IP
// block, Brevo send / EMAIL_CODE_DEV_LOG dev print) via the
// `outreach:${memberId}` purpose. Unknown phone numbers get the exact same
// response shape as known ones - no enumeration.
import { prisma } from "@/lib/prisma";
import { issueEmailCode, checkEmailCodeDetailed, consumeEmailCode, ipBlockedForCodes, recordWrongCode, type EmailCodePurpose } from "@/lib/email-code";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { maskEmail } from "./mask-email";
import { createDeviceSession } from "./device";

const NEUTRAL_MESSAGE = "If you're on the team, a code was sent to your email.";

function memberPurpose(memberId: string): EmailCodePurpose {
  return `outreach:${memberId}`;
}

async function findActiveMember(teamId: string, phoneDigits: string) {
  return prisma.outreachMember.findFirst({ where: { teamId, phone: phoneDigits, active: true, removedAt: null } });
}

export type RequestCodeResult = { ok: true; message: string; maskedEmail?: string } | { ok: false; status: number; error: string };

/**
 * Issues a login code for the member matching `phoneDigits` on `teamId`, or
 * does nothing (but still returns the neutral "ok" response) when no such
 * active member exists. A per-team+IP limiter caps the overall request rate
 * regardless of outcome, on top of lib/email-code.ts's own per-IP/per-email
 * limiters, so scanning phone numbers against a team is still rate-limited
 * even though every outcome looks identical.
 */
export async function requestMemberLoginCode(teamId: string, phoneDigits: string, ip: string): Promise<RequestCodeResult> {
  if (await ipBlockedForCodes(ip)) return { ok: false, status: 429, error: "Too many attempts from your network. Please try again later." };
  if (!(await sharedRateLimit(`outreach-login-ip:${teamId}:${ip}`, 20, 15 * 60_000))) {
    return { ok: false, status: 429, error: "Too many attempts. Please wait a few minutes." };
  }
  const member = await findActiveMember(teamId, phoneDigits);
  if (!member) return { ok: true, message: NEUTRAL_MESSAGE };
  const result = await issueEmailCode(member.email, memberPurpose(member.id), ip);
  if (!result.ok) {
    // Still neutral to an outside observer (status/error text is the same
    // "please wait" shape email-code.ts already uses for real rate limits),
    // but surfaced so the real member sees why nothing arrived.
    return { ok: false, status: result.status, error: result.error };
  }
  return { ok: true, message: NEUTRAL_MESSAGE, maskedEmail: maskEmail(member.email) };
}

export type VerifyCodeResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; status: number; error: string };

export async function verifyMemberLoginCode(teamId: string, phoneDigits: string, code: string, ip: string): Promise<VerifyCodeResult> {
  if (await ipBlockedForCodes(ip)) return { ok: false, status: 429, error: "Too many wrong codes from your network. Please try again later." };
  const member = await findActiveMember(teamId, phoneDigits);
  if (!member) {
    await recordWrongCode(ip);
    return { ok: false, status: 400, error: "Incorrect or expired code." };
  }
  const check = await checkEmailCodeDetailed(member.email, memberPurpose(member.id), code);
  if (!check.ok) {
    await recordWrongCode(ip);
    const error = check.reason === "locked" ? "Too many wrong codes. Request a new one." : check.reason === "expired" ? "That code expired. Request a new one." : "Incorrect code.";
    return { ok: false, status: 400, error };
  }
  if (!(await consumeEmailCode(check.id))) {
    return { ok: false, status: 400, error: "That code was already used. Request a new one." };
  }
  const session = await createDeviceSession(member.id);
  return { ok: true, token: session.token, expiresAt: session.expiresAt };
}
