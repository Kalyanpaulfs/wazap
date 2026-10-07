import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { join } from "path";
import P from "pino";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface BulkJob {
  id: string;
  total: number;
  current: number;
  sent: number;
  failed: number;
  status: "running" | "paused" | "done" | "error";
  log: { number: string; name: string; ok: boolean; time: number }[];
}

// Each user gets an isolated session directory so every customer connects
// their OWN WhatsApp number. Multi-tenant — no shared global socket.
// Spintax: {a|b|c} -> a random option, resolved fresh for every message so
// each recipient gets slightly different text (anti-ban).
function spin(text: string): string {
  return text.replace(/\{([^{}]*\|[^{}]*)\}/g, (_m, g) => {
    const opts = String(g).split("|");
    return opts[Math.floor(Math.random() * opts.length)];
  });
}

const SESSIONS_ROOT = join(process.cwd(), ".wa-sessions");

class UserWA {
  private sock: WASocket | null = null;
  private connStatus: ConnectionStatus = "disconnected";
  private latestQR: string | null = null;
  private job: BulkJob | null = null;
  private jobTimer: NodeJS.Timeout | null = null;
  // SSE listeners for QR / status push
  private listeners: Set<(event: string, data: string) => void> = new Set();
  private readonly sessionDir: string;

  constructor(private readonly userId: string) {
    this.sessionDir = join(SESSIONS_ROOT, userId);
  }

  private emit(event: string, data: string) {
    this.listeners.forEach((fn) => fn(event, data));
  }

  subscribe(fn: (event: string, data: string) => void) {
    this.listeners.add(fn);
    // immediately send current state to new subscriber
    fn("status", this.connStatus);
    if (this.latestQR) fn("qr", this.latestQR);
    return () => this.listeners.delete(fn);
  }

  getStatus(): ConnectionStatus { return this.connStatus; }
  getJob(): BulkJob | null { return this.job; }

  async connect() {
    if (this.connStatus === "connected") return;
    this.connStatus = "connecting";
    this.emit("status", "connecting");

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: "silent" }),
      browser: ["Wazap", "Chrome", "1.0"],
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.latestQR = qr;
        this.emit("qr", qr);
      }

      if (connection === "close") {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        this.connStatus = "disconnected";
        this.latestQR = null;
        this.emit("status", "disconnected");
        if (!loggedOut) {
          // Auto-reconnect on drop
          setTimeout(() => this.connect(), 3000);
        }
      }

      if (connection === "open") {
        this.connStatus = "connected";
        this.latestQR = null;
        this.emit("status", "connected");
      }
    });
  }

  async disconnect() {
    if (this.jobTimer) clearTimeout(this.jobTimer);
    if (this.sock) {
      await this.sock.logout().catch(() => {});
      this.sock = null;
    }
    this.connStatus = "disconnected";
    this.latestQR = null;
    this.job = null;
    this.emit("status", "disconnected");

    // Clear this user's saved session only
    const { rm } = await import("fs/promises");
    await rm(this.sessionDir, { recursive: true, force: true });
  }

  async sendMessage(number: string, text: string): Promise<void> {
    if (!this.sock || this.connStatus !== "connected") {
      throw new Error("WhatsApp not connected");
    }
    const jid = `${number}@s.whatsapp.net`;
    await this.sock.sendMessage(jid, { text });
  }

  // Real WhatsApp validation — checks which numbers are actually registered,
  // using the user's own connected session (Baileys onWhatsApp).
  async checkNumbers(numbers: string[]): Promise<{ number: string; exists: boolean }[]> {
    if (!this.sock || this.connStatus !== "connected") {
      throw new Error("WhatsApp not connected");
    }
    const out: { number: string; exists: boolean }[] = [];
    const BATCH = 25;
    for (let i = 0; i < numbers.length; i += BATCH) {
      const batch = numbers.slice(i, i + BATCH);
      const clean = batch.map((n) => n.replace(/\D/g, ""));
      try {
        const res = await this.sock.onWhatsApp(...clean);
        const existing = new Set(
          (res ?? [])
            .filter((r: { exists?: boolean }) => r.exists)
            .map((r: { jid: string }) => String(r.jid).split("@")[0].replace(/\D/g, ""))
        );
        for (const n of batch) out.push({ number: n, exists: existing.has(n.replace(/\D/g, "")) });
      } catch {
        for (const n of batch) out.push({ number: n, exists: false });
      }
    }
    return out;
  }

  // Anti-ban: randomise the wait between sends around the requested delay
  // (±~30%) so the cadence never looks like a fixed-interval robot.
  private nextDelay(delaySec: number): number {
    const base = Math.max(10, delaySec) * 1000;
    const jitter = base * (0.7 + Math.random() * 0.6); // 0.7x – 1.3x
    return Math.round(jitter);
  }

  startBulkJob(
    entries: { number: string; name: string }[],
    message: string,
    delaySec: number,
    maxSends: number = -1,
    onSent?: () => Promise<void>
  ): BulkJob {
    if (this.jobTimer) clearTimeout(this.jobTimer);

    this.job = {
      id: Date.now().toString(),
      total: maxSends !== -1 ? Math.min(entries.length, maxSends) : entries.length,
      current: 0,
      sent: 0,
      failed: 0,
      status: "running",
      log: [],
    };

    const fire = async () => {
      const job = this.job!;
      if (job.status !== "running") return;

      // Stop if plan limit reached
      if (maxSends !== -1 && job.sent >= maxSends) {
        job.status = "done";
        this.emit("job", JSON.stringify({ ...job, limitReached: true }));
        return;
      }

      if (job.current >= entries.length) {
        job.status = "done";
        this.emit("job", JSON.stringify(job));
        return;
      }

      const entry = entries[job.current];
      const text = spin(message).replace(/\{name\}/gi, entry.name || "there");

      try {
        await this.sendMessage(entry.number, text);
        job.sent++;
        job.log.push({ number: entry.number, name: entry.name, ok: true, time: Date.now() });
        if (onSent) await onSent().catch(() => {});
      } catch {
        job.failed++;
        job.log.push({ number: entry.number, name: entry.name, ok: false, time: Date.now() });
      }

      job.current++;
      this.emit("job", JSON.stringify(job));

      if (maxSends !== -1 && job.sent >= maxSends) {
        job.status = "done";
        this.emit("job", JSON.stringify({ ...job, limitReached: true }));
        return;
      }

      if (job.current < entries.length && job.status === "running") {
        this.jobTimer = setTimeout(fire, this.nextDelay(delaySec));
      } else {
        job.status = "done";
        this.emit("job", JSON.stringify(job));
      }
    };

    fire();
    return this.job;
  }

  pauseJob() {
    if (this.job) this.job.status = "paused";
    if (this.jobTimer) clearTimeout(this.jobTimer);
  }

  resumeJob(entries: { number: string; name: string }[], message: string, delaySec: number, maxSends: number = -1, onSent?: () => Promise<void>) {
    if (!this.job || this.job.status !== "paused") return;
    this.job.status = "running";
    this.startBulkJob(entries.slice(this.job.current), message, delaySec, maxSends, onSent);
  }
}

// Registry of per-user WhatsApp sessions. Kept on globalThis so it survives
// Next.js route re-evaluation while PM2 keeps the process alive.
const globalForWA = globalThis as typeof globalThis & { waRegistry?: Map<string, UserWA> };
if (!globalForWA.waRegistry) globalForWA.waRegistry = new Map<string, UserWA>();

export function getUserWA(userId: string): UserWA {
  const registry = globalForWA.waRegistry!;
  let wa = registry.get(userId);
  if (!wa) {
    wa = new UserWA(userId);
    registry.set(userId, wa);
  }
  return wa;
}

export type { UserWA };
