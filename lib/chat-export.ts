export type ChatDateOrder = "day-first" | "month-first";
export type ChatRow = { date: Date; sender: string; text: string };

// Common Android and iPhone text exports; message contents never leave this parser.
export function parseWhatsAppChat(raw: string, order: ChatDateOrder = "day-first"): ChatRow[] {
  const rows: ChatRow[] = [];
  const stamp = /^(?:\[)?(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?(?:\]\s*|\s*[-–]\s*)(.*)$/i;
  for (const source of raw.split(/\r?\n/)) {
    const line = source.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/[\u00a0\u202f]/g, " ");
    const match = line.match(stamp);
    if (!match) {
      if (rows.length && line.trim()) rows[rows.length - 1].text += "\n" + line.trim();
      continue;
    }
    // System notices have timestamps but no sender. Do not count them as messages.
    const message = match[8].match(/^([^:]+):\s?(.*)$/);
    if (!message) continue;
    const day = Number(match[order === "day-first" ? 1 : 2]);
    const month = Number(match[order === "day-first" ? 2 : 1]);
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    let hour = Number(match[4]);
    const minute = Number(match[5]), second = Number(match[6] || 0);
    if (match[7]) {
      if (hour < 1 || hour > 12) continue;
      hour = hour % 12 + (/PM/i.test(match[7]) ? 12 : 0);
    }
    if (hour > 23 || minute > 59 || second > 59) continue;
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) continue;
    rows.push({ date, sender: message[1].trim(), text: message[2] });
  }
  return rows;
}
