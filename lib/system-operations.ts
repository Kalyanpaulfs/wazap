import "server-only";
import { readFile } from "node:fs/promises";

const RESTORE_STATE_PATH = "/var/lib/wazap-backup/last-restore-verification.json";
const MAX_RESTORE_AGE_MS = 36 * 60 * 60 * 1000;

type RestoreRecord = {
  status?: unknown;
  verifiedAt?: unknown;
  backup?: unknown;
  bytes?: unknown;
  durationSeconds?: unknown;
  reason?: unknown;
};

export type BackupRestoreStatus = {
  status: "healthy" | "failed" | "stale" | "missing";
  verifiedAt: string | null;
  backup: string | null;
  bytes: number | null;
  durationSeconds: number | null;
  reason: string | null;
};

export async function backupRestoreStatus(): Promise<BackupRestoreStatus> {
  try {
    const record = JSON.parse(await readFile(RESTORE_STATE_PATH, "utf8")) as RestoreRecord;
    const verifiedAt = typeof record.verifiedAt === "string" ? record.verifiedAt : null;
    const timestamp = verifiedAt ? Date.parse(verifiedAt) : Number.NaN;
    const stale = !Number.isFinite(timestamp) || Date.now() - timestamp > MAX_RESTORE_AGE_MS || timestamp > Date.now() + 5 * 60_000;
    const failed = record.status !== "ok";
    return {
      status: failed ? "failed" : stale ? "stale" : "healthy",
      verifiedAt,
      backup: typeof record.backup === "string" ? record.backup.slice(0, 120) : null,
      bytes: typeof record.bytes === "number" && Number.isFinite(record.bytes) ? record.bytes : null,
      durationSeconds: typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds) ? record.durationSeconds : null,
      reason: failed && typeof record.reason === "string" ? record.reason.slice(0, 200) : null,
    };
  } catch {
    return {
      status: "missing",
      verifiedAt: null,
      backup: null,
      bytes: null,
      durationSeconds: null,
      reason: "No valid restore-verification record is available.",
    };
  }
}
