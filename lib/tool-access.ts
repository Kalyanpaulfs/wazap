import { PLAN_PRICES } from "./billing";

// Tool access limits by plan
export const TOOL_LIMITS = {
  widget: {
    free:     { uses: 1,   label: "1 preview",        note: "Wazap branding on widget" },
    basic:    { uses: -1,  label: "Unlimited",         note: "Remove branding" },
    pro:      { uses: -1,  label: "Unlimited",         note: "Remove branding" },
    ultimate: { uses: -1,  label: "Unlimited",         note: "Remove branding + analytics" },
  },
  bulk: {
    free:     { uses: 10,  label: "10 contacts/day",    note: "Test with 10 numbers" },
    basic:    { uses: 50,  label: "50 contacts/day",   note: "" },
    pro:      { uses: 500, label: "500 contacts/day",  note: "" },
    ultimate: { uses: -1,  label: "Unlimited",         note: "" },
  },
  checker: {
    free:     { uses: 10,  label: "10 numbers",        note: "Test with 10" },
    basic:    { uses: 100, label: "100/day",            note: "" },
    pro:      { uses: 500, label: "500/day",            note: "" },
    ultimate: { uses: -1,  label: "Unlimited",         note: "" },
  },
  adBuilder: {
    free:     { uses: 1,   label: "1 link",            note: "Try it out" },
    basic:    { uses: 5,   label: "5 links",           note: "" },
    pro:      { uses: 20,  label: "20 links",          note: "" },
    ultimate: { uses: -1,  label: "Unlimited",         note: "" },
  },
  vcard: {
    free:     { uses: 1,   label: "1 download",        note: "" },
    basic:    { uses: -1,  label: "Unlimited",         note: "" },
    pro:      { uses: -1,  label: "Unlimited",         note: "" },
    ultimate: { uses: -1,  label: "Unlimited",         note: "" },
  },
  linktree: {
    free:     { uses: 1,   label: "1 free page",   note: "Try before you upgrade" },
    basic:    { uses: 3,   label: "3 pages",       note: "" },
    pro:      { uses: 10,  label: "10 pages",      note: "" },
    ultimate: { uses: -1,  label: "Unlimited",     note: "" },
  },
  rotator: {
    free:     { uses: 1,   label: "1 free rotator", note: "Try before you upgrade" },
    basic:    { uses: 3,   label: "3 rotators",     note: "" },
    pro:      { uses: 10,  label: "10 rotators",    note: "" },
    ultimate: { uses: -1,  label: "Unlimited",      note: "" },
  },
  transcript: {
    free:     { uses: 1,   label: "1 export",          note: "" },
    basic:    { uses: -1,  label: "Unlimited",         note: "" },
    pro:      { uses: -1,  label: "Unlimited",         note: "" },
    ultimate: { uses: -1,  label: "Unlimited",         note: "" },
  },
  audiences: {
    free:     { uses: -1,  label: "Unlimited",         note: "Save & reuse contact lists" },
    basic:    { uses: -1,  label: "Unlimited",         note: "" },
    pro:      { uses: -1,  label: "Unlimited",         note: "" },
    ultimate: { uses: -1,  label: "Unlimited",         note: "" },
  },
  spinner: {
    free:     { uses: -1,  label: "Unlimited",         note: "Template variations" },
    basic:    { uses: -1,  label: "Unlimited",         note: "" },
    pro:      { uses: -1,  label: "Unlimited",         note: "" },
    ultimate: { uses: -1,  label: "Unlimited",         note: "" },
  },
  qr: {
    free:     { uses: -1, label: "Unlimited", note: "" }, basic:    { uses: -1, label: "Unlimited", note: "" },
    pro:      { uses: -1, label: "Unlimited", note: "" }, ultimate: { uses: -1, label: "Unlimited", note: "" },
  },
  link: {
    free:     { uses: -1, label: "Unlimited", note: "" }, basic:    { uses: -1, label: "Unlimited", note: "" },
    pro:      { uses: -1, label: "Unlimited", note: "" }, ultimate: { uses: -1, label: "Unlimited", note: "" },
  },
  templates: {
    free:     { uses: -1, label: "Unlimited", note: "" }, basic:    { uses: -1, label: "Unlimited", note: "" },
    pro:      { uses: -1, label: "Unlimited", note: "" }, ultimate: { uses: -1, label: "Unlimited", note: "" },
  },
  shortlink: {
    free:     { uses: 1,   label: "1 free link",  note: "Try before you upgrade" },
    basic:    { uses: 5,   label: "5 links",      note: "" },
    pro:      { uses: 25,  label: "25 links",     note: "" },
    ultimate: { uses: -1,  label: "Unlimited",    note: "" },
  },
  catalog: {
    free:     { uses: 1,   label: "1 free page",  note: "Try before you upgrade" },
    basic:    { uses: 3,   label: "3 pages",      note: "" },
    pro:      { uses: 10,  label: "10 pages",     note: "" },
    ultimate: { uses: -1,  label: "Unlimited",    note: "" },
  },
  formatter: {
    free:     { uses: 1,   label: "1 free copy",  note: "Then upgrade" },
    basic:    { uses: -1,  label: "Unlimited",    note: "" },
    pro:      { uses: -1,  label: "Unlimited",    note: "" },
    ultimate: { uses: -1,  label: "Unlimited",    note: "" },
  },
  chatInsights: {
    free: { uses: 1, label: "1 analysis/day", note: "Private browser analysis" }, basic: { uses: 10, label: "10/day", note: "" },
    pro: { uses: 50, label: "50/day", note: "" }, ultimate: { uses: -1, label: "Unlimited", note: "" },
  },
  replyGenerator: {
    free: { uses: 5, label: "5 replies/day", note: "" }, basic: { uses: 50, label: "50/day", note: "" },
    pro: { uses: 250, label: "250/day", note: "" }, ultimate: { uses: -1, label: "Unlimited", note: "" },
  },
  messageScheduler: {
    free: { uses: 3, label: "3 reminders/day", note: "" }, basic: { uses: 25, label: "25/day", note: "" },
    pro: { uses: 100, label: "100/day", note: "" }, ultimate: { uses: -1, label: "Unlimited", note: "" },
  },
  leads: {
    free:     { uses: 15,   label: "15 active leads",  note: "Try the follow-up workflow" },
    basic:    { uses: 250,  label: "250 active leads", note: "For solo operators" },
    pro:      { uses: 2000, label: "2,000 active leads", note: "For growing pipelines" },
    ultimate: { uses: -1,  label: "Unlimited",        note: "Unlimited lead records" },
  },
};

export const PLANS = [
  {
    name: "Free",
    accessKey: "free" as const,
    price: 0,
    color: "#64748b",
    desc: "Try every tool",
    highlight: false,
  },
  {
    name: "Solo",
    accessKey: "basic" as const,
    price: PLAN_PRICES.basic,
    color: "#3b82f6",
    desc: "Starter monthly access",
    highlight: false,
  },
  {
    name: "Growth",
    accessKey: "pro" as const,
    price: PLAN_PRICES.pro,
    color: "#25D366",
    desc: "Business monthly access",
    highlight: true,
  },
  {
    name: "Team",
    accessKey: "ultimate" as const,
    price: PLAN_PRICES.ultimate,
    color: "#a855f7",
    desc: "Unlimited monthly access",
    highlight: false,
  },
  {
    name: "Business",
    accessKey: "ultimate" as const,
    price: PLAN_PRICES.business,
    color: "#f59e0b",
    desc: "Team access plus managed setup",
    highlight: false,
  },
];
