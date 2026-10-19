// One daily support summary email instead of an hourly email per waiting
// item (Joseph got ~240 alert emails a day, Oct 2026). Brand-new customer
// messages still alert instantly - see lib/support-monitor.ts.

export const SUPPORT_DIGEST_HOUR = 9; // Dubai time (UTC+4, no DST)
const DUBAI_OFFSET_MS = 4 * 3600_000;

export type WaitingItem = { kind: "chat" | "request"; name?: string | null; email?: string | null; topic?: string | null; waitingSince: string };

// Dubai calendar day, and whether today's summary may go out yet.
export function supportDigestSlot(now: Date) {
  const dubai = new Date(now.getTime() + DUBAI_OFFSET_MS);
  return { day: dubai.toISOString().slice(0, 10), due: dubai.getUTCHours() >= SUPPORT_DIGEST_HOUR };
}

function waited(since: string, now: Date) {
  const hours = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 3600_000));
  return hours < 48 ? `${hours} hours` : `${Math.floor(hours / 24)} days`;
}

export function buildSupportDigest(input: { waiting: WaitingItem[]; mailboxProblems: string[]; deliveryFailures: number; now: Date }) {
  const { waiting, mailboxProblems, deliveryFailures, now } = input;
  if (!waiting.length && !mailboxProblems.length && !deliveryFailures) return null;
  const sorted = [...waiting].sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
  const lines: string[] = [];
  if (sorted.length) {
    lines.push(`Still waiting for a reply (${sorted.length}):`);
    sorted.forEach((item, i) => {
      const who = [item.name || "Website visitor", item.email ? `<${item.email}>` : ""].filter(Boolean).join(" ");
      const what = item.kind === "chat" ? "Live chat" : `Contact form${item.topic ? `: ${item.topic}` : ""}`;
      lines.push(`${i + 1}. ${who} - ${what} - waiting ${waited(item.waitingSince, now)}`);
    });
    lines.push("", "Reply, or move spam to Trash, in Admin -> Support.");
  }
  if (mailboxProblems.length || deliveryFailures) {
    if (lines.length) lines.push("");
    lines.push("Other problems:");
    if (mailboxProblems.length) lines.push(`- Mailboxes not connected: ${mailboxProblems.join(", ")}`);
    if (deliveryFailures) lines.push(`- Service emails that failed to send: ${deliveryFailures}`);
  }
  const subject = sorted.length
    ? `Wazap support: ${sorted.length} ${sorted.length === 1 ? "customer" : "customers"} waiting for a reply`
    : "Wazap support: inbox or delivery needs attention";
  return { subject, message: lines.join("\n") };
}
