// Tool access limits by plan
//
// Rotator / short link / ad link limits live in lib/plan-limits.ts.
export const TOOL_LIMITS = {
  widget: {
    // Display only - access is decided by widgetAvailable() in lib/plan-limits.ts.
    free:     { uses: 0,   label: "Paid plans",        note: "Included in Solo, Growth and Agency" },
    basic:    { uses: -1,  label: "Included",          note: "" },
    pro:      { uses: -1,  label: "Included",          note: "" },
    ultimate: { uses: -1,  label: "Included",          note: "" },
  },
  qr: {
    free:     { uses: -1, label: "Unlimited", note: "" }, basic:    { uses: -1, label: "Unlimited", note: "" },
    pro:      { uses: -1, label: "Unlimited", note: "" }, ultimate: { uses: -1, label: "Unlimited", note: "" },
  },
  link: {
    free:     { uses: -1, label: "Unlimited", note: "" }, basic:    { uses: -1, label: "Unlimited", note: "" },
    pro:      { uses: -1, label: "Unlimited", note: "" }, ultimate: { uses: -1, label: "Unlimited", note: "" },
  },
  leads: {
    free:     { uses: 15,   label: "15 active leads",  note: "Try the follow-up workflow" },
    basic:    { uses: 250,  label: "250 active leads", note: "For solo operators" },
    pro:      { uses: 2000, label: "2,000 active leads", note: "For growing pipelines" },
    ultimate: { uses: -1,  label: "Unlimited",        note: "Unlimited lead records" },
  },
};

// Shared by app/api/leads (web) and app/api/v1/leads (public API, PAY-10) so
// both enforce the exact same active-lead cap.
export function leadLimit(plan: string) {
  const limits = TOOL_LIMITS.leads;
  const key = plan === "business" ? "ultimate" : plan;
  return (limits[key as keyof typeof limits] ?? limits.free).uses;
}

