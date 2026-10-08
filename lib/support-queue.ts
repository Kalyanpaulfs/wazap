export const SUPPORT_REPLY_TARGET_MINUTES = 30;
type Turn = { sender: string; createdAt: Date | string };
export function responseState(waitingSince: Date | string | null, now = new Date()) {
  const since = waitingSince ? new Date(waitingSince) : null;
  const due = since ? new Date(since.getTime() + SUPPORT_REPLY_TARGET_MINUTES * 60000) : null;
  return { awaitingReply: Boolean(since), waitingSince: since?.toISOString() || null, dueAt: due?.toISOString() || null, overdue: Boolean(due && due <= now), targetMinutes: SUPPORT_REPLY_TARGET_MINUTES };
}
export function chatResponseState(chat: { status: string; messages: Turn[] }, now = new Date()) {
  if (chat.status === "closed" || chat.status === "ai") return responseState(null, now);
  const lastAdmin = Math.max(0, ...chat.messages.filter(m => m.sender === "admin").map(m => new Date(m.createdAt).getTime()));
  const waiting = chat.messages.filter(m => m.sender === "visitor" && new Date(m.createdAt).getTime() > lastAdmin).sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return responseState(waiting[0]?.createdAt || null, now);
}
