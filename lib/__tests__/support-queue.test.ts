import { describe, expect, it } from "vitest";
import { SUPPORT_REPLY_TARGET_HOURS, SUPPORT_REPLY_TARGET_MINUTES, chatResponseState, responseState, timerState } from "@/lib/support-queue";

describe("SUPPORT_REPLY_TARGET_HOURS / SUPPORT_REPLY_TARGET_MINUTES", () => {
  it("is the 12-hour 'AI first, human when needed' SLA, in both units", () => {
    expect(SUPPORT_REPLY_TARGET_HOURS).toBe(12);
    expect(SUPPORT_REPLY_TARGET_MINUTES).toBe(12 * 60);
  });
});

describe("timerState", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("is ok with no due date", () => {
    expect(timerState(null, now)).toBe("ok");
  });

  it("is ok with plenty of time left", () => {
    expect(timerState(new Date("2026-01-01T20:00:00Z"), now)).toBe("ok");
  });

  it("is soon inside the last 2 hours", () => {
    expect(timerState(new Date("2026-01-01T13:30:00Z"), now)).toBe("soon");
    expect(timerState(new Date("2026-01-01T14:00:00Z"), now)).toBe("soon");
  });

  it("is late once the due date has passed", () => {
    expect(timerState(new Date("2026-01-01T11:59:59Z"), now)).toBe("late");
    expect(timerState(now, now)).toBe("late");
  });
});

describe("responseState", () => {
  it("reports no reply needed when nothing is waiting", () => {
    const state = responseState(null);
    expect(state.awaitingReply).toBe(false);
    expect(state.dueAt).toBeNull();
    expect(state.overdue).toBe(false);
    expect(state.state).toBe("ok");
  });

  it("computes a due date 12 hours after waitingSince, and the matching state", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const waitingSince = new Date("2026-01-01T12:00:00Z"); // exactly 12h before `now`
    const state = responseState(waitingSince, now);
    expect(state.awaitingReply).toBe(true);
    expect(state.dueAt).toBe(new Date("2026-01-02T00:00:00Z").toISOString());
    expect(state.overdue).toBe(true);
    expect(state.state).toBe("late");
  });

  it("is 'soon' inside the last 2 hours of the window", () => {
    const waitingSince = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-01-01T10:30:00Z"); // 1.5h before the 12h due date
    const state = responseState(waitingSince, now);
    expect(state.overdue).toBe(false);
    expect(state.state).toBe("soon");
  });
});

describe("chatResponseState", () => {
  it("has no SLA for ai or closed chats", () => {
    expect(chatResponseState({ status: "ai", messages: [] }).awaitingReply).toBe(false);
    expect(chatResponseState({ status: "closed", messages: [{ sender: "visitor", createdAt: new Date() }] }).awaitingReply).toBe(false);
  });

  it("waits on the first visitor message after the last admin reply, for an open chat", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const chat = {
      status: "open",
      messages: [
        { sender: "visitor", createdAt: new Date("2026-01-01T00:00:00Z") },
        { sender: "admin", createdAt: new Date("2026-01-01T01:00:00Z") },
        { sender: "visitor", createdAt: new Date("2026-01-01T02:00:00Z") },
        { sender: "visitor", createdAt: new Date("2026-01-01T03:00:00Z") },
      ],
    };
    const state = chatResponseState(chat, now);
    expect(state.waitingSince).toBe(new Date("2026-01-01T02:00:00Z").toISOString());
    expect(state.awaitingReply).toBe(true);
  });
});
