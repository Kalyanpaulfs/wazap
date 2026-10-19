import "server-only";
import { readFile } from "node:fs/promises";

// The app runs in an isolated runtime that can't see the host's /var/lib, so
// the backup job must also drop a copy into /opt/wazap-private.
const RESTORE_STATE_PATHS = [
  process.env.WAZAP_RESTORE_STATE_PATH,
  "/opt/wazap-private/last-restore-verification.json",
  "/var/lib/wazap-backup/last-restore-verification.json",
].filter((p): p is string => Boolean(p));
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

async function readRestoreState() {
  for (const path of RESTORE_STATE_PATHS) {
    try { return await readFile(path, "utf8"); } catch {}
  }
  throw new Error("No restore-verification record found.");
}

export async function backupRestoreStatus(): Promise<BackupRestoreStatus> {
  try {
    const record = JSON.parse(await readRestoreState()) as RestoreRecord;
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
