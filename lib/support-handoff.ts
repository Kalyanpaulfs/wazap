// Pure rules for "AI first, human when needed": decides whether a chat
// needs a human, builds the short reference number customers and admins
// use to talk about a conversation, and decides when the team should get
// an email alert (new flag, or re-flag after the admin already engaged).
// No DB/IO here on purpose - see lib/support-chat-service.ts for the parts
// that touch Prisma, and lib/__tests__/support-handoff.test.ts for coverage.

export type HandoffAiAnswer = { handoff?: boolean; reason?: string | null } | null | undefined;

export type HandoffResult = { flagged: boolean; reason: string | null };

const HUMAN_REQUEST_PATTERNS: RegExp[] = [
  // English: only real requests for a person. Single words like "person",
  // "agent" or "manager" also appear in normal product questions ("add a
  // salesperson", "my sales agents"), so they only count inside a request.
  /\b(?:talk|speak|chat|connect me|put me through)\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+|your\s+)?(?:someone|somebody|human|person|agent|representative|manager|support team|team|staff)\b/i,
  /\b(?:real|live|actual)\s+(?:human|person|agent|people)\b/i,
  /\bhuman\s+(?:agent|support|help|being)\b/i,
  /\b(?:need|want)\s+(?:a\s+)?(?:human|person|representative)\b/i,
  /\bare you (?:a )?(?:human|real)\b/i,
  /\b(?:get|give|call)\s+me\s+(?:a\s+|an\s+|the\s+|your\s+)?(?:human|person|manager|supervisor|agent)\b/i,
  // Spanish
  /\bhumano\b/i,
  /persona real/i,
  /hablar con alguien/i,
  /hablar con un agente/i,
  // French
  /\bhumain\b/i,
  /une personne/i,
  /parler à quelqu'?un/i,
  // Portuguese
  /pessoa real/i,
  /falar com algu[ée]m/i,
  // German
  /mit jemandem sprechen/i,
  /echte person/i,
];

const MONEY_TOPIC_PATTERNS: RegExp[] = [
  /\brefunds?\b/i,
  /\brefunded\b/i,
  /charged\s+twice/i,
  /double[\s-]?charg(?:e|ed|ing)/i,
  /payment\s+(?:failed|declined|didn'?t\s+work|not\s+working)/i,
  /\bchargeback\b/i,
  /cancel(?:l)?(?:ing)?\s+(?:my\s+)?subscription/i,
  /billing\s+(?:issue|problem)/i,
];

/** Decides whether a visitor message needs a human, and why. */
export function evaluateHandoff(message: string, answer: HandoffAiAnswer): HandoffResult {
  if (answer === null || answer === undefined) return { flagged: true, reason: "AI assistant unavailable" };
  if (answer.handoff === true) return { flagged: true, reason: answer.reason || "AI flagged this conversation for a human" };
  const text = message || "";
  if (HUMAN_REQUEST_PATTERNS.some(pattern => pattern.test(text))) return { flagged: true, reason: "Customer asked to speak with a person" };
  if (MONEY_TOPIC_PATTERNS.some(pattern => pattern.test(text))) return { flagged: true, reason: "Possible billing, refund or payment issue" };
  return { flagged: false, reason: null };
}

/** Convenience boolean form of evaluateHandoff, for call sites that don't need the reason. */
export function needsHuman(message: string, answer: HandoffAiAnswer): boolean {
  return evaluateHandoff(message, answer).flagged;
}

export type AlertDecisionInput = {
  /** The conversation's status before this message was recorded ("ai" | "open" | "closed"), or null for a brand-new conversation. */
  previousStatus: string | null;
  /** The sender of the most recent message before this one ("visitor" | "bot" | "admin"), or null if there is none. */
  lastMessageSender: string | null;
  /** Whether evaluateHandoff flags this incoming message. */
  flaggedNow: boolean;
};

export type AlertDecision = {
  /** The chat should be/remain flagged ("open") after this message. */
  flagged: boolean;
  /** The team should get an email alert for this message. */
  shouldAlert: boolean;
};

/**
 * Alerting rule: send the team email only on the transition into "needs a
 * human" (new flag), or when the visitor writes again in a chat the admin
 * already replied to or marked solved (re-flag). A chat that is already
 * flagged and still waiting on the admin stays flagged, silently - no
 * repeat email per message.
 */
export function decideSupportAlert(input: AlertDecisionInput): AlertDecision {
  const { previousStatus, lastMessageSender, flaggedNow } = input;
  if (previousStatus === "closed") return { flagged: true, shouldAlert: true };
  if (previousStatus === "open") return { flagged: true, shouldAlert: lastMessageSender === "admin" };
  return { flagged: flaggedNow, shouldAlert: flaggedNow };
}

/** Short human reference for a conversation, e.g. "#A1B2C3". */
export function supportReference(id: string): string {
  const clean = (id || "").replace(/[^a-zA-Z0-9]/g, "");
  const tail = (clean.slice(-6) || "000000").toUpperCase().padStart(6, "0");
  return "#" + tail;
}

/** Customer-facing text shown (and saved to chat history) when a chat is handed off. */
export function handoffMessage(reference: string, replyWithinHours: number): string {
  return `I've passed this to our team. You'll get a reply within ${replyWithinHours} hours, here and by email. Reference ${reference}.`;
}
