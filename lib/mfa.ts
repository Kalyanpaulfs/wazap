import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer): string {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function decode32(secret: string): Buffer {
  let bits = 0, value = 0; const output: number[] = [];
  for (const char of secret) { const digit = alphabet.indexOf(char); if (digit < 0) throw new Error("Invalid MFA secret"); value = (value << 5) | digit; bits += 5; if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(output);
}
export function totp(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decode32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits);
  return String(value).padStart(digits, "0");
}
export function matchingStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const step of [current, current - 1, current + 1]) if (timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  return null;
}
function key(): Buffer {
  if (process.env.MFA_ENCRYPTION_KEY) {
    if (!/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY)) throw new Error("Invalid MFA encryption configuration");
    return Buffer.from(process.env.MFA_ENCRYPTION_KEY, "hex");
  }
  if (!process.env.NEXTAUTH_SECRET) throw new Error("MFA encryption not configured");
  return createHash("sha256").update("wazap:mfa:v1:" + process.env.NEXTAUTH_SECRET).digest();
}
export function sealMfa(secret: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(v => v.toString("base64url")).join(".");
}
function openMfa(secret: string): string {
  const [iv, tag, data] = secret.split(".").map(v => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export type MfaState = { enabled: boolean; secret: string | null; pending: string | null; pendingExpiresAt: Date | null; lastStep: bigint; recoveryHashes: string[] };
export async function mfaState(userId: string): Promise<MfaState | null> {
  const rows = await prisma.$queryRaw<MfaState[]>`SELECT "enabled", "secret", "pending", "pendingExpiresAt", "lastStep", "recoveryHashes" FROM "SecurityMfa" WHERE "userId" = ${userId}`;
  return rows[0] || null;
}
export function recoveryHash(code: string): string { return createHash("sha256").update("mfa-recovery:" + code.trim().toLowerCase()).digest("hex"); }
export async function verifyMfa(userId: string, code: string): Promise<boolean> {
  const state = await mfaState(userId);
  if (!state?.enabled || !state.secret) return false;
  const step = matchingStep(openMfa(state.secret), code);
  if (step !== null) {
    const rows = await prisma.$queryRaw<Array<{ userId: string }>>`UPDATE "SecurityMfa" SET "lastStep" = ${BigInt(step)} WHERE "userId" = ${userId} AND "enabled" = true AND "secret" = ${state.secret} AND "lastStep" < ${BigInt(step)} RETURNING "userId"`;
    return rows.length === 1;
  }
  if (!/^[a-f0-9]{32}$/i.test(code.trim())) return false;
  const hash = recoveryHash(code);
  const rows = await prisma.$queryRaw<Array<{ userId: string }>>`UPDATE "SecurityMfa" SET "recoveryHashes" = array_remove("recoveryHashes", ${hash}) WHERE "userId" = ${userId} AND "enabled" = true AND ${hash} = ANY("recoveryHashes") RETURNING "userId"`;
  return rows.length === 1;
}
export function pendingStep(state: MfaState, code: string): number | null {
  if (!state.pending || !state.pendingExpiresAt || state.pendingExpiresAt <= new Date()) return null;
  return matchingStep(openMfa(state.pending), code);
}
