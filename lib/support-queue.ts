// Support reply SLA: "AI first, human when needed, reply within 12 hours."
// SUPPORT_REPLY_TARGET_HOURS is the single source of truth; everything else
// (including the SUPPORT_REPLY_TARGET_MINUTES export existing callers use)
// derives from it.
export const SUPPORT_REPLY_TARGET_HOURS = 12;
export const SUPPORT_REPLY_TARGET_MINUTES = SUPPORT_REPLY_TARGET_HOURS * 60;
// "soon" kicks in inside the last 2 hours of the SLA window.
export const SUPPORT_REPLY_SOON_HOURS = 2;

export type TimerState = "ok" | "soon" | "late";

/** ok (plenty of time) / soon (<=2h left) / late (overdue). No due date = ok. */
export function timerState(dueAt: Date | string | null, now: Date | string = new Date()): TimerState {
  if (!dueAt) return "ok";
  const due = new Date(dueAt).getTime();
  const current = new Date(now).getTime();
  if (due <= current) return "late";
  if (due - current <= SUPPORT_REPLY_SOON_HOURS * 3600000) return "soon";
  return "ok";
}

type Turn = { sender: string; createdAt: Date | string };

export function responseState(waitingSince: Date | string | null, now = new Date()) {
  const since = waitingSince ? new Date(waitingSince) : null;
  const due = since ? new Date(since.getTime() + SUPPORT_REPLY_TARGET_MINUTES * 60000) : null;
  return {
    awaitingReply: Boolean(since),
    waitingSince: since?.toISOString() || null,
    dueAt: due?.toISOString() || null,
    overdue: Boolean(due && due <= now),
    state: since ? timerState(due, now) : ("ok" as TimerState),
    targetMinutes: SUPPORT_REPLY_TARGET_MINUTES,
  };
}

export function chatResponseState(chat: { status: string; messages: Turn[] }, now = new Date()) {
  if (chat.status === "closed" || chat.status === "ai") return responseState(null, now);
  const lastAdmin = Math.max(0, ...chat.messages.filter(m => m.sender === "admin").map(m => new Date(m.createdAt).getTime()));
  const waiting = chat.messages.filter(m => m.sender === "visitor" && new Date(m.createdAt).getTime() > lastAdmin).sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return responseState(waiting[0]?.createdAt || null, now);
}
