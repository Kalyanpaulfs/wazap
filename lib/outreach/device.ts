// FEAT-QUEUE: "remembered device" sessions for team-outreach salespeople.
// Deliberately NOT the signed-HMAC-cookie pattern lib/support-session.ts
// uses - the brief asks for a random token whose HASH is stored in the DB,
// so a leaked DB row can't be replayed as a cookie and a single row can be
// revoked (member removal / "log out all devices" / regenerate link code)
// without rotating any server secret.
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const OUTREACH_DEVICE_COOKIE = "wazap_outreach_device";
export const DEVICE_TTL_DAYS = 90;

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const outreachDeviceCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: DEVICE_TTL_DAYS * 86_400,
};

/** Creates a new device row for `memberId` and returns the raw token to set as the cookie value (only its hash is ever stored). */
export async function createDeviceSession(memberId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + DEVICE_TTL_DAYS * 86_400_000);
  await prisma.outreachDevice.create({ data: { memberId, tokenHash: hashDeviceToken(token), expiresAt } });
  return { token, expiresAt };
}

export type VerifiedDevice = { memberId: string; teamId: string; deviceId: string };

/**
 * Verifies a device cookie token and returns the member/team it belongs to,
 * or null when the token is missing/unknown/revoked/expired, or when the
 * member has since been removed/deactivated (removal blocks every device
 * immediately - no separate revoke needed for that case).
 */
export async function verifyDeviceToken(token: string | undefined | null, now = new Date()): Promise<VerifiedDevice | null> {
  if (!token) return null;
  const tokenHash = hashDeviceToken(token);
  const device = await prisma.outreachDevice.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      member: { select: { id: true, teamId: true, active: true, removedAt: true } },
    },
  });
  if (!device || device.revokedAt || device.expiresAt <= now) return null;
  if (!device.member.active || device.member.removedAt) return null;
  // Best-effort freshness marker; never block the request if this fails.
  prisma.outreachDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } }).catch(() => {});
  return { memberId: device.member.id, teamId: device.member.teamId, deviceId: device.id };
}

export type DeviceStatus =
  | { ok: true; memberId: string; teamId: string; deviceId: string }
  | { ok: false; reason: "signed_out" | "removed" };

/**
 * Like verifyDeviceToken, but distinguishes WHY a device is invalid - for
 * the salesperson /team/<code>/home page's friendly states ("removed" ->
 * "you're no longer on this team" vs "signed_out" -> show the login form
 * again). verifyDeviceToken itself stays a plain null for every invalid
 * case (used by the fast-path claim route and the give-back/logout APIs,
 * which don't need to tell them apart).
 */
export async function checkDeviceStatus(token: string | undefined | null, now = new Date()): Promise<DeviceStatus> {
  if (!token) return { ok: false, reason: "signed_out" };
  const tokenHash = hashDeviceToken(token);
  const device = await prisma.outreachDevice.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      member: { select: { id: true, teamId: true, active: true, removedAt: true } },
    },
  });
  if (!device) return { ok: false, reason: "signed_out" };
  if (!device.member.active || device.member.removedAt) return { ok: false, reason: "removed" };
  if (device.revokedAt || device.expiresAt <= now) return { ok: false, reason: "signed_out" };
  // Best-effort freshness marker; never block the request if this fails.
  prisma.outreachDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } }).catch(() => {});
  return { ok: true, memberId: device.member.id, teamId: device.member.teamId, deviceId: device.id };
}

/** Owner action: "log out all devices" for one member. */
export async function revokeAllDevicesForMember(memberId: string, now = new Date()): Promise<void> {
  await prisma.outreachDevice.updateMany({ where: { memberId, revokedAt: null }, data: { revokedAt: now } });
}

/** Salesperson's own "log out this device" action. */
export async function revokeDeviceToken(token: string, now = new Date()): Promise<void> {
  await prisma.outreachDevice.updateMany({ where: { tokenHash: hashDeviceToken(token), revokedAt: null }, data: { revokedAt: now } });
}
