// Full customer-journey end-to-end check against the LOCAL dev server
// (http://localhost:3000), acting like a real browser over HTTP (fetch +
// manual cookie jar for the NextAuth email-code flow), with direct Prisma
// used only for test setup/verification/cleanup.
//
// Usage: npx tsx tests/e2e/customer-e2e.ts
//
// Everything this script creates uses emails e2e-<runId>-<label>@wazap-qa.test
// and is deleted again in the `finally` block at the end, pass or fail.
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspaces";
import { syncPlanLimits } from "@/lib/plan-limit-sync";
import { staffReply as libStaffReply } from "@/lib/support-tickets";

const cleanHtml = (s: string) => s.replace(/<!--.*?-->/g, "");

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const DEV_LOG =
  process.env.DEV_LOG ||
  "C:/Users/paulk/AppData/Local/Temp/claude/D--wazap-wazap-business/c825a569-c362-4afd-b477-5147ec943014/scratchpad/dev.log";
const RUN = Date.now();
const DOMAIN = "wazap-qa.test";
const emailFor = (label: string) => `e2e-${RUN}-${label}@${DOMAIN}`;

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------
type Status = "PASS" | "FAIL" | "SKIP";
type Result = { section: string; name: string; status: Status; detail?: string };
const results: Result[] = [];

async function check(section: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ section, name, status: "PASS" });
  } catch (err) {
    results.push({ section, name, status: "FAIL", detail: err instanceof Error ? err.message : String(err) });
  }
}
function skip(section: string, name: string, reason: string) {
  results.push({ section, name, status: "SKIP", detail: reason });
}
function assertTrue(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// ---------------------------------------------------------------------------
// Minimal cookie jar + HTTP helper
// ---------------------------------------------------------------------------
class Jar {
  cookies = new Map<string, string>();
  apply(headers: Headers) {
    const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
    const setCookies = typeof anyHeaders.getSetCookie === "function" ? anyHeaders.getSetCookie() : [];
    for (const sc of setCookies) {
      const pair = sc.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

type HttpResult = { status: number; headers: Headers; body: any; text: string; location: string | null };

async function http(
  jar: Jar | null,
  path: string,
  init: RequestInit & { ip?: string } = {},
): Promise<HttpResult> {
  const headers = new Headers(init.headers || {});
  if (jar && jar.cookies.size) headers.set("Cookie", jar.header());
  if (init.ip) headers.set("X-Forwarded-For", init.ip);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  if (jar) jar.apply(res.headers);
  const text = await res.text().catch(() => "");
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body, text, location: res.headers.get("location") };
}

// ---------------------------------------------------------------------------
// Dev-log email code reader (EMAIL_CODE_DEV_LOG=true prints codes instead of
// sending real email - see lib/email-code.ts).
// ---------------------------------------------------------------------------
function latestCodeInLog(email: string, purpose: "login" | "confirm"): string | null {
  if (!fs.existsSync(DEV_LOG)) return null;
  const content = fs.readFileSync(DEV_LOG, "utf8").replace(/\0/g, "");
  const lines = content.split(/\r?\n/);
  const needle = `${purpose} code for ${email} is `;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(needle)) {
      const m = lines[i].match(/is (\d{6})/);
      if (m) return m[1];
    }
  }
  return null;
}

async function waitForCode(email: string, purpose: "login" | "confirm" = "login", timeoutMs = 8000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const code = latestCodeInLog(email, purpose);
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${purpose} code for ${email} in dev log`);
}

// ---------------------------------------------------------------------------
// Auth helpers (real HTTP flow: csrf -> request code -> read dev log ->
// NextAuth credentials callback), mirroring app/components/EmailCodeSignIn.tsx.
// ---------------------------------------------------------------------------
async function requestLoginCode(email: string) {
  return http(null, "/api/auth/email-code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, purpose: "login" }),
  });
}

async function requestConfirmCode(jar: Jar) {
  return http(jar, "/api/auth/email-code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ purpose: "confirm" }),
  });
}

async function signIn(jar: Jar, email: string, opts: { name?: string } = {}) {
  const sendResult = await requestLoginCode(email);
  if (sendResult.status !== 200) throw new Error(`code request failed: ${sendResult.status} ${sendResult.text}`);
  const code = await waitForCode(email, "login");
  const csrfRes = await http(jar, "/api/auth/csrf");
  const csrfToken = csrfRes.body?.csrfToken;
  if (!csrfToken) throw new Error("no csrf token");
  const params = new URLSearchParams({
    email,
    code,
    otp: "",
    name: opts.name || "",
    attribution: "",
    marketing: "false",
    csrfToken,
    json: "true",
  });
  const result = await http(jar, "/api/auth/callback/email-code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE },
    body: params.toString(),
  });
  return result;
}

async function getSession(jar: Jar) {
  const r = await http(jar, "/api/auth/session");
  return r.body as { user?: { id: string; email: string; plan?: string; name?: string } } | null;
}

// ---------------------------------------------------------------------------
// Cleanup tracking
// ---------------------------------------------------------------------------
const createdUserIds = new Set<string>();
const createdEmails = new Set<string>();
const createdVisitorIds = new Set<string>();
function trackEmail(email: string) {
  createdEmails.add(email);
}
function trackVisitor(visitorId: string) {
  createdVisitorIds.add(visitorId);
}
async function trackUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) createdUserIds.add(user.id);
  trackEmail(email);
  return user?.id ?? null;
}

async function cleanupAll() {
  // Resolve any ids we only know by email (e.g. accounts created through
  // the real sign-up flow, where we never got the id any other way).
  for (const email of createdEmails) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) createdUserIds.add(user.id);
  }
  // Also sweep for anything matching the run's email pattern directly, in
  // case a test created a user we forgot to track.
  const sweep = await prisma.user.findMany({ where: { email: { contains: `e2e-${RUN}-` } }, select: { id: true, email: true } });
  for (const u of sweep) {
    createdUserIds.add(u.id);
    createdEmails.add(u.email);
  }

  const ids = [...createdUserIds];
  if (!ids.length) return;

  await prisma.funnelEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.siteVisit.deleteMany({ where: { userId: { in: ids } } });
  await prisma.outboundEmail.deleteMany({ where: { userId: { in: ids } } });
  await prisma.billingAuditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.emailCode.deleteMany({ where: { email: { in: [...createdEmails] } } });
  // SUPPORT-2: SupportConversation has no FK/cascade from User (plain
  // userId string, same style as CrmLead.ownerId - see schema comment), so
  // it must be cleaned up explicitly by visitorId. This cascades (DB-level
  // ON DELETE CASCADE) to SupportTicket, SupportChatMessage and
  // SupportAttachment for that conversation.
  await prisma.supportConversation.deleteMany({ where: { visitorId: { in: [...createdVisitorIds] } } }).catch(() => {});
  // Quick-answer feedback rows use a plain answerId string (not a DB
  // relation) - our e2e feedback checks tag theirs with the run id so they
  // can be swept without touching real answer ids.
  await prisma.supportAnswerFeedback.deleteMany({ where: { answerId: { startsWith: `e2e-${RUN}` } } }).catch(() => {});
  await prisma.crmActivity.deleteMany({ where: { lead: { email: { in: [...createdEmails] } } } }).catch(() => {});
  await prisma.crmLead.deleteMany({ where: { email: { in: [...createdEmails] } } }).catch(() => {});
  // Pre-existing gap (not new): the PayPal "manual invoice" fallback tested
  // in the misc billing check creates a real ContactMessage for the free
  // plan test user's email - clean that up too.
  await prisma.contactMessage.deleteMany({ where: { email: { in: [...createdEmails] } } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  // User delete cascades to Workspace (owner), WorkspaceMember, RotatorLink,
  // ShortLink, AdLink (+AdLinkClick), ConversationStart, DailyUsage,
  // PasswordResetToken (see prisma/schema.prisma onDelete: Cascade).
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

// ---------------------------------------------------------------------------
// Direct-DB test user factory (plan/planExpiresAt set directly, as the task
// instructs, to exercise each plan's limits without a real payment).
// ---------------------------------------------------------------------------
async function createDbUser(
  label: string,
  data: {
    plan?: string;
    planExpiresAt?: Date | null;
    trialPlan?: string | null;
    trialStartedAt?: Date | null;
    trialEndsAt?: Date | null;
    trialReminderSentAt?: Date | null;
  } = {},
) {
  const email = emailFor(label);
  const user = await prisma.user.create({
    data: {
      email,
      name: label,
      emailVerifiedAt: new Date(),
      plan: data.plan ?? "free",
      planExpiresAt: data.planExpiresAt ?? null,
      trialPlan: data.trialPlan ?? null,
      trialStartedAt: data.trialStartedAt ?? null,
      trialEndsAt: data.trialEndsAt ?? null,
      trialReminderSentAt: data.trialReminderSentAt ?? null,
    },
  });
  createdUserIds.add(user.id);
  trackEmail(email);
  return user;
}

async function loggedInJar(email: string, name?: string): Promise<Jar> {
  const jar = new Jar();
  const result = await signIn(jar, email, { name });
  if (result.status !== 200 || result.body?.error) {
    throw new Error(`sign-in failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return jar;
}

async function getOrigin(jar: Jar | null = null) {
  return { Origin: BASE, "Content-Type": "application/json", ...(jar ? { Cookie: jar.header() } : {}) };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** "yyyy-mm-dd" for `daysAgo` days before now - used for custom date-range
 * checks so they stay valid (and, where data must fall inside the range,
 * actually include "now") regardless of what today's real date is. */
function dateDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

// ===========================================================================
// MAIN
// ===========================================================================
async function main() {
  console.log(`Run id: ${RUN}`);
  console.log(`Base URL: ${BASE}`);

  // -------------------------------------------------------------------------
  // A. Public pages / redirects / private-page gating
  // -------------------------------------------------------------------------
  const PUBLIC_PAGES = [
    "/", "/pricing", "/whatsapp-lead-routing", "/whatsapp-ad-tracking", "/whatsapp-short-links",
    "/whatsapp-website-widget", "/support", "/contact", "/privacy", "/terms", "/refund", "/login", "/signup",
  ];
  for (const path of PUBLIC_PAGES) {
    await check("A", `public page 200: ${path}`, async () => {
      const r = await http(null, path);
      assertEqual(r.status, 200, `GET ${path}`);
    });
  }

  const REMOVED_REDIRECTS: Array<[string, number, string | RegExp]> = [
    ["/ai-agents", 308, "/whatsapp-website-widget"],
    ["/inbox", 307, "/dashboard"],
    ["/automations", 307, "/dashboard"],
    ["/faq", 308, "/#faq"],
    ["/c/x", 307, "/"],
    ["/l/x", 307, "/"],
    ["/tools/vcard", 308, "/tools"],
  ];
  for (const [path, , expected] of REMOVED_REDIRECTS) {
    await check("A", `removed-feature redirect: ${path}`, async () => {
      const r = await http(null, path);
      assertTrue(r.status === 307 || r.status === 308, `GET ${path} should redirect, got ${r.status}`);
      const loc = r.location || "";
      const matches = typeof expected === "string" ? loc.endsWith(expected) : expected.test(loc);
      assertTrue(matches, `GET ${path} -> Location "${loc}" should end with/match "${expected}"`);
    });
  }

  // UX-1 step 5: /performance, /reports, /plans are gone as real app pages -
  // they're now plain redirects (unconditional, no auth check) to their new
  // home (/results, /results?tab=link, /billing#plans). Only /results,
  // /billing etc. themselves still gate on login. So a logged-out hit on one
  // of these old URLs is a two-hop redirect: old path -> new path -> /login
  // (the second hop only happens once you actually request the new path).
  const PRIVATE_PAGES = ["/dashboard", "/results", "/billing", "/account", "/links", "/links/new"];
  for (const path of PRIVATE_PAGES) {
    await check("A", `private page redirects to login when logged out: ${path}`, async () => {
      const r = await http(null, path);
      const isHttpRedirect = (r.status === 307 || r.status === 308) && (r.location || "").includes("/login");
      const isStreamRedirect = r.status === 200 && r.text.includes("NEXT_REDIRECT") && r.text.includes("/login");
      assertTrue(isHttpRedirect || isStreamRedirect, `GET ${path} should redirect when logged out, got ${r.status}`);
      if (isHttpRedirect) {
        assertTrue((r.location || "").includes("/login"), `GET ${path} -> Location "${r.location}" should go to /login`);
      }
    });
  }

  const MERGED_PAGE_REDIRECTS: Array<[string, string]> = [
    ["/performance", "/results"],
    ["/reports", "/results"],
    ["/plans", "/billing"],
  ];
  for (const [oldPath, newPath] of MERGED_PAGE_REDIRECTS) {
    await check("A", `merged page ${oldPath} redirects to ${newPath}, which then redirects to login when logged out`, async () => {
      const first = await http(null, oldPath);
      assertTrue(first.status === 307 || first.status === 308, `GET ${oldPath} should redirect, got ${first.status}`);
      assertTrue((first.location || "").includes(newPath), `GET ${oldPath} -> Location "${first.location}" should include "${newPath}"`);
      const second = await http(null, first.location!.replace(/^https?:\/\/[^/]+/, ""));
      assertTrue(second.status === 307 || second.status === 308, `following ${oldPath} -> ${first.location} should redirect to login, got ${second.status}`);
      assertTrue((second.location || "").includes("/login"), `second hop Location "${second.location}" should go to /login`);
    });
  }

  await check("A", "logged-out /tools/rotator loads 200 and /api/rotator is 401 (auth banner displays on client)", async () => {
    const pageRes = await http(null, "/tools/rotator");
    assertEqual(pageRes.status, 200, "GET /tools/rotator should load 200");
    const apiRes = await http(null, "/api/rotator");
    assertEqual(apiRes.status, 401, "GET /api/rotator should be 401 when logged out");
  });

  // -------------------------------------------------------------------------
  // B. Sign-up + login via the real flow
  // -------------------------------------------------------------------------
  const signupEmail = emailFor("signup");
  trackEmail(signupEmail);
  const signupJar = new Jar();
  await check("B", "sign-up via real email-code flow creates account + session", async () => {
    const result = await signIn(signupJar, signupEmail, { name: "E2E Signup" });
    assertEqual(result.status, 200, `callback status, body=${JSON.stringify(result.body)}`);
    const sess = await getSession(signupJar);
    assertTrue(!!sess?.user?.id, "session should have a user after sign-up");
    assertEqual(sess!.user!.email, signupEmail, "session email");
  });

  await check("B", "new account has 3-day Free trial (trialPlan basic) and session plan basic", async () => {
    const dbUser = await prisma.user.findUnique({ where: { email: signupEmail } });
    assertTrue(!!dbUser, "user should exist in DB");
    assertEqual(dbUser!.plan, "free", "raw plan column should be free");
    assertEqual(dbUser!.trialPlan, "basic", "trialPlan should be basic (Solo)");
    assertTrue(!!dbUser!.trialEndsAt, "trialEndsAt should be set");
    const daysLeft = (dbUser!.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
    assertTrue(daysLeft > 2.9 && daysLeft <= 3.01, `trial should be ~3 days, got ${daysLeft.toFixed(2)}`);
    const sess = await getSession(signupJar);
    assertEqual(sess!.user!.plan, "basic", "session effective plan during trial should be basic");
  });

  await check("B", "trial is capped at 100 routed leads (FEAT-TRIAL-100-LEADS)", async () => {
    const r = await http(signupJar, "/api/rotator");
    assertEqual(r.status, 200, "GET /api/rotator");
    assertEqual(r.body.quota.limit, 100, "trial should be capped at 100 leads");
    assertEqual(r.body.quota.used, 0, "no leads used yet");
    assertEqual(r.body.quota.remaining, 100, "all 100 trial leads should be remaining");
    assertEqual(r.body.quota.allowed, true, "trial routing should be allowed while under the cap");
    assertEqual(r.body.quota.plan, "basic", "routerPlan now honours the trial, same as linkPlan (Solo-equivalent)");
  });

  // -------------------------------------------------------------------------
  // C + D + E. Per-plan logged-in pages, limits, grandfathering, salesperson names
  // -------------------------------------------------------------------------
  // UX-1 step 4/5: logged-in users get redirected off the old app/tools/*
  // create pages into the new /links/new/* in-app flow (tested separately,
  // once, right after this loop) - /tools/widget and /qr stay as themselves
  // for logged-in users too (free tools, never redirected).
  const PLAN_LOGGED_IN_PAGES = [
    "/dashboard", "/links", "/links/new", "/tools", "/tools/widget",
    "/qr", "/results", "/billing", "/account", "/support",
  ];

  // UX-1 step 1: rotators/short links/ad links now share ONE pool
  // (linkLimit), and ad links are additionally gated by whether the plan
  // offers them at all (adAvailable) - see lib/plan-limits.ts.
  type PlanCfg = { key: "free" | "basic" | "pro" | "ultimate"; linkLimit: number; numbersLimit: number; adAvailable: boolean; widget: boolean };
  const PLANS: PlanCfg[] = [
    // Free-trial restructure: "free" (no paid plan, no active trial) is 0 of
    // everything - nothing is grandfathered any more. The website widget is
    // the one exception: owner decision, free and unlimited for every plan
    // (including free/anonymous) - see lib/plan-limits.ts WIDGET_AVAILABLE.
    { key: "free", linkLimit: 0, numbersLimit: 0, adAvailable: false, widget: true },
    { key: "basic", linkLimit: 5, numbersLimit: 3, adAvailable: false, widget: true },
    { key: "pro", linkLimit: 20, numbersLimit: 10, adAvailable: true, widget: true },
    { key: "ultimate", linkLimit: 55, numbersLimit: 20, adAvailable: true, widget: true },
  ];

  const planJars = new Map<string, Jar>();
  const planUsers = new Map<string, { id: string }>();

  for (const plan of PLANS) {
    const label = `plan-${plan.key}`;
    const email = emailFor(label);
    const planExpiresAt = plan.key === "free" ? null : new Date(Date.now() + 30 * 86_400_000);
    const user = await createDbUser(label, { plan: plan.key, planExpiresAt, trialPlan: null, trialEndsAt: null });
    planUsers.set(plan.key, user);

    await check("B/C", `log in as DB-created ${plan.key} user via email code`, async () => {
      const jar = await loggedInJar(email, label);
      const sess = await getSession(jar);
      assertEqual(sess!.user!.plan, plan.key, `session plan for ${plan.key} user`);
      planJars.set(plan.key, jar);
    });

    const jar = planJars.get(plan.key);
    if (!jar) {
      skip("C", `${plan.key}: logged-in pages 200`, "login failed for this plan, see B/C check above");
      continue;
    }

    for (const path of PLAN_LOGGED_IN_PAGES) {
      await check("C", `${plan.key} plan: ${path} 200`, async () => {
        const r = await http(jar, path);
        assertEqual(r.status, 200, `GET ${path} as ${plan.key}`);
      });
    }

    // --- D. Shared link pool limit (UX-1 step 1) ---
    await check("D", `${plan.key}: link pool limit is ${plan.linkLimit}, shared across rotators and short links`, async () => {
      // Pre-fill `linkLimit` rotators directly (setup), then confirm the API
      // itself refuses one more rotator AND a short link - the pool is
      // shared, so filling it with one type blocks the other too.
      for (let i = 0; i < plan.linkLimit; i++) {
        await prisma.rotatorLink.create({
          data: { userId: user.id, code: `E2ER${RUN}${plan.key}${i}`, name: `prefill ${i}`, numbers: ["919800000001"], fallbackNumber: "919800000001" },
        });
      }
      const rotatorResult = await http(jar, "/api/rotator", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "one too many", numbers: ["919800000099"] }),
      });
      assertEqual(rotatorResult.status, 403, `creating rotator #${plan.linkLimit + 1} should be refused once the pool is full`);
      if (plan.linkLimit > 0) assertTrue(rotatorResult.body?.upgrade === true, "refusal should carry upgrade:true");

      const shortLinkResult = await http(jar, "/api/shortlinks", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "one too many", phone: "919800000098" }),
      });
      assertEqual(shortLinkResult.status, 403, "a short link should also be refused - the pool is shared, not per-type");

      // While the pool is full of real rotator rows, confirm the link
      // details page for one of them still renders (UX-1 step 4 page).
      if (plan.linkLimit > 0) {
        const anyRotator = await prisma.rotatorLink.findFirst({ where: { userId: user.id, code: { startsWith: `E2ER${RUN}${plan.key}` } } });
        assertTrue(!!anyRotator, "expected at least one prefilled rotator");
        const detailsResult = await http(jar, `/links/rotator/${anyRotator!.id}`);
        assertEqual(detailsResult.status, 200, `GET /links/rotator/${anyRotator!.id} as ${plan.key}`);
      }

      // Clean up the count-limit pre-fills so later tests on this plan user aren't blocked by count limit
      await prisma.rotatorLink.deleteMany({ where: { userId: user.id, code: { startsWith: `E2ER${RUN}${plan.key}` } } });
    });

    // --- D. Numbers-per-rotator limit ---
    await check("D", `${plan.key}: numbers-per-rotator limit is ${plan.numbersLimit}`, async () => {
      if (plan.numbersLimit === 0) {
        // 0-limit plan (free/no-trial): rotator creation itself is refused
        // outright, before the numbers-per-rotator check is even reached -
        // there's no "just within the limit" numbers array to test.
        const r = await http(jar, "/api/rotator", {
          method: "POST",
          headers: await getOrigin(jar),
          body: JSON.stringify({ name: "should fail", numbers: ["919800099999"] }),
        });
        assertEqual(r.status, 403, "rotator creation on a 0-numbers-limit plan should be refused");
        return;
      }
      const okNumbers = Array.from({ length: plan.numbersLimit }, (_, i) => `9198000${String(i).padStart(5, "0")}`);
      const tooMany = Array.from({ length: plan.numbersLimit + 1 }, (_, i) => `9198001${String(i).padStart(5, "0")}`);
      const okResult = await http(jar, "/api/rotator", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "numbers ok", numbers: okNumbers }),
      });
      // May itself be refused by the shared link pool (already at/over it
      // from the previous check) - that's fine, we only care about the
      // numbers-limit branch when the pool limit doesn't get in the way first.
      if (okResult.status === 403 && okResult.body?.error && /used .* of .* links/i.test(okResult.body.error)) {
        // pool limit reached first; still verify the too-many-numbers case alone
      } else {
        assertEqual(okResult.status, 200, `rotator with exactly ${plan.numbersLimit} numbers should be accepted`);
        // Clean up the created rotator so it doesn't permanently occupy one
        // of this plan user's pool slots for every later check on them.
        await prisma.rotatorLink.deleteMany({ where: { id: okResult.body.id, userId: user.id } });
      }
      const tooManyResult = await http(jar, "/api/rotator", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "numbers too many", numbers: tooMany }),
      });
      assertEqual(tooManyResult.status, 403, `rotator with ${plan.numbersLimit + 1} numbers should be refused`);
    });

    // --- D. The pool is shared the other way too: short links alone can fill it ---
    await check("D", `${plan.key}: filling the pool with short links alone also blocks a new rotator`, async () => {
      for (let i = 0; i < plan.linkLimit; i++) {
        await prisma.shortLink.create({ data: { userId: user.id, code: `e2esl${RUN}${plan.key}${i}`, name: `sl${i}`, phone: "919800000001" } });
      }
      const r = await http(jar, "/api/rotator", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "blocked by short links", numbers: ["919800000098"] }),
      });
      assertEqual(r.status, 403, `rotator should be refused once ${plan.linkLimit} short links fill the pool`);
      await prisma.shortLink.deleteMany({ where: { userId: user.id, code: { startsWith: `e2esl${RUN}${plan.key}` } } });
    });

    // --- D. Ad links availability (not a count - a plan gate) ---
    await check("D", `${plan.key}: ad links available = ${plan.adAvailable}`, async () => {
      const r = await http(jar, "/api/adlinks", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "ad link", number: "919800000099" }),
      });
      if (!plan.adAvailable) {
        assertEqual(r.status, 403, `ad link creation should be refused - not available on ${plan.key}`);
      } else {
        assertEqual(r.status, 200, `ad link creation should succeed on ${plan.key} with room in the pool`);
        await prisma.adLink.deleteMany({ where: { userId: user.id, name: "ad link" } });
      }
    });

    // --- D. Widget availability ---
    await check("D", `${plan.key}: widget allowed = ${plan.widget}`, async () => {
      const r = await http(jar, "/api/tools/use?tool=widget");
      assertEqual(r.status, 200, "GET /api/tools/use?tool=widget");
      assertEqual(r.body.available, plan.widget, `widget availability for ${plan.key}`);
      const postResult = await http(jar, "/api/tools/use", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ tool: "widget" }),
      });
      if (plan.widget) assertEqual(postResult.status, 200, "widget usage POST should succeed");
      else assertEqual(postResult.status, 403, "widget usage POST should be refused on free");
    });
  }

  // --- C. UX-1 step 4: logged-in users hitting the old app/tools/* create
  // pages get redirected straight into the new in-app create flow instead of
  // the old page (logged-out visitors still get the public SEO page - see
  // the "logged-out /tools/rotator loads 200" check in section A above).
  await check("C", "logged-in /tools/* create pages redirect into /links/new/*", async () => {
    const jar = planJars.get("pro");
    assertTrue(!!jar, "need a logged-in pro user");
    const cases: Array<[string, string]> = [
      ["/tools/rotator", "/links/new/rotator"],
      ["/tools/shortlink", "/links/new/brand"],
      ["/tools/ad-builder", "/links/new/ad"],
      ["/tools/link", "/links/new/brand?simple=1"],
    ];
    for (const [oldPath, newPath] of cases) {
      const r = await http(jar!, oldPath);
      assertTrue(r.status === 307 || r.status === 308, `GET ${oldPath} (logged in) should redirect, got ${r.status}`);
      assertTrue((r.location || "").includes(newPath), `GET ${oldPath} -> Location "${r.location}" should include "${newPath}"`);
    }
  });

  // --- C. logged-in /tools (hub) now shows the "All tools" page (paid +
  // free tool cards from lib/tool-catalog.ts) instead of redirecting into
  // /links/new; /qr stays itself (free tool) with its own logged-in frame.
  await check("C", "logged-in /tools shows the All tools page; /qr stays 200", async () => {
    const jar = planJars.get("pro");
    assertTrue(!!jar, "need a logged-in pro user");
    const toolsResult = await http(jar!, "/tools");
    assertEqual(toolsResult.status, 200, "GET /tools (logged in) should load 200");
    assertTrue(toolsResult.text.includes("All tools"), "logged-in /tools should render the All tools heading");
    assertTrue(toolsResult.text.includes("Paid tools"), "logged-in /tools should render the Paid tools section");
    assertTrue(toolsResult.text.includes("Free tools"), "logged-in /tools should render the Free tools section");
    const qrResult = await http(jar!, "/qr");
    assertEqual(qrResult.status, 200, "GET /qr (logged in) should stay 200");
    assertTrue(qrResult.text.includes("/links/new"), "logged-in /qr should show the 'Create a link' back-link");
  });

  // --- D. Solo: create 5 mixed links through the real POST APIs (not direct
  // DB inserts), confirm all 5 succeed, then the 6th of either type is
  // refused - and ad links are refused outright on Solo regardless of room.
  await check("D", "solo: creating 5 mixed links (rotators + short links) via the real APIs fills the pool, 6th of either type refused", async () => {
    const jar = planJars.get("basic");
    const user = planUsers.get("basic")!;
    assertTrue(!!jar, "need a logged-in solo user");
    const createdIds: Array<{ model: "rotatorLink" | "shortLink"; id: string }> = [];
    try {
      for (let i = 0; i < 3; i++) {
        const r = await http(jar!, "/api/rotator", {
          method: "POST",
          headers: await getOrigin(jar),
          body: JSON.stringify({ name: `mix rotator ${i}`, numbers: [`91980010${String(i).padStart(4, "0")}`] }),
        });
        assertEqual(r.status, 200, `rotator ${i}/5 should be created: ${JSON.stringify(r.body)}`);
        createdIds.push({ model: "rotatorLink", id: r.body.id });
      }
      for (let i = 0; i < 2; i++) {
        const r = await http(jar!, "/api/shortlinks", {
          method: "POST",
          headers: await getOrigin(jar),
          body: JSON.stringify({ name: `mix shortlink ${i}`, phone: `91980011${String(i).padStart(4, "0")}` }),
        });
        assertEqual(r.status, 200, `short link ${i}/5 should be created: ${JSON.stringify(r.body)}`);
        createdIds.push({ model: "shortLink", id: r.body.id });
      }
      assertEqual(createdIds.length, 5, "5 mixed links should now exist, filling Solo's pool of 5");

      const sixthRotator = await http(jar!, "/api/rotator", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "6th", numbers: ["919800129999"] }),
      });
      assertEqual(sixthRotator.status, 403, "6th link (rotator) should be refused once the pool of 5 is full");

      const sixthShortlink = await http(jar!, "/api/shortlinks", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "6th", phone: "919800139999" }),
      });
      assertEqual(sixthShortlink.status, 403, "6th link (short link) should be refused once the pool of 5 is full");

      const adAttempt = await http(jar!, "/api/adlinks", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "ad on solo", number: "919800149999" }),
      });
      assertEqual(adAttempt.status, 403, "ad links are refused outright on Solo, even with pool room");
    } finally {
      await prisma.rotatorLink.deleteMany({ where: { id: { in: createdIds.filter((c) => c.model === "rotatorLink").map((c) => c.id) }, userId: user.id } });
      await prisma.shortLink.deleteMany({ where: { id: { in: createdIds.filter((c) => c.model === "shortLink").map((c) => c.id) }, userId: user.id } });
    }
  });

  // --- D. Brand slug availability check endpoint (UX-1 step 3) ---
  await check("D", "GET /api/shortlinks/check: available / taken / invalid", async () => {
    const jar = planJars.get("pro");
    const user = planUsers.get("pro")!;
    assertTrue(!!jar, "need a logged-in pro user");
    const takenSlug = `e2etaken${RUN}`;
    const taken = await prisma.shortLink.create({ data: { userId: user.id, code: takenSlug, name: "taken slug probe", phone: "919800159999" } });
    try {
      const invalidResult = await http(jar!, "/api/shortlinks/check?slug=A!");
      assertEqual(invalidResult.status, 200, "GET /api/shortlinks/check (invalid slug)");
      assertEqual(invalidResult.body.valid, false, "a slug with invalid characters should be valid:false");

      const takenResult = await http(jar!, `/api/shortlinks/check?slug=${takenSlug}`);
      assertEqual(takenResult.status, 200, "GET /api/shortlinks/check (taken slug)");
      assertEqual(takenResult.body.valid, true, "an existing, otherwise-valid slug should still be valid:true");
      assertEqual(takenResult.body.available, false, "an existing slug should be available:false");

      const availableSlug = `e2efree${RUN}`;
      const availableResult = await http(jar!, `/api/shortlinks/check?slug=${availableSlug}`);
      assertEqual(availableResult.status, 200, "GET /api/shortlinks/check (available slug)");
      assertEqual(availableResult.body.valid, true, "a fresh valid slug should be valid:true");
      assertEqual(availableResult.body.available, true, "a fresh slug nobody has used should be available:true");

      const loggedOutResult = await http(null, `/api/shortlinks/check?slug=${availableSlug}`);
      assertEqual(loggedOutResult.status, 401, "GET /api/shortlinks/check should require login");
    } finally {
      await prisma.shortLink.deleteMany({ where: { id: taken.id } });
    }
  });

  // --- D. Salespeople (numbers-per-rotator) limit enforced on PATCH too, on a freshly-created (not legacy/grandfathered) rotator ---
  await check("D", "growth: PATCH adding a salesperson past the plan's numbers-per-rotator limit is refused; same-count reorder is allowed", async () => {
    const jar = planJars.get("pro");
    assertTrue(!!jar, "need a logged-in pro user");
    const numbers = Array.from({ length: 10 }, (_, i) => `9198017${String(i).padStart(4, "0")}`); // pro's limit is 10
    const createResult = await http(jar!, "/api/rotator", {
      method: "POST",
      headers: await getOrigin(jar),
      body: JSON.stringify({ name: "salespeople limit probe", numbers }),
    });
    assertEqual(createResult.status, 200, `create with exactly 10 numbers should succeed: ${JSON.stringify(createResult.body)}`);
    const id = createResult.body.id as string;
    try {
      const reorderPatch = await http(jar!, "/api/rotator", {
        method: "PATCH",
        headers: await getOrigin(jar),
        body: JSON.stringify({ id, numbers: numbers.slice().reverse() }),
      });
      assertEqual(reorderPatch.status, 200, "PATCH keeping the same count (reordered) should be allowed");

      const overLimitPatch = await http(jar!, "/api/rotator", {
        method: "PATCH",
        headers: await getOrigin(jar),
        body: JSON.stringify({ id, numbers: [...numbers, "919801799999"] }),
      });
      assertEqual(overLimitPatch.status, 403, "PATCH adding an 11th number past Growth's limit of 10 should be refused");
    } finally {
      await prisma.rotatorLink.deleteMany({ where: { id } });
    }
  });

  // --- D. Phone validation (server-side, lib/phone.ts isPlausibleE164Digits): bad numbers -> 400 on all 3 create APIs ---
  await check("D", "phone validation: implausible numbers are refused (400) on rotator, short link and ad link create", async () => {
    const jar = planJars.get("pro");
    assertTrue(!!jar, "need a logged-in pro user");
    const rotatorResult = await http(jar!, "/api/rotator", {
      method: "POST",
      headers: await getOrigin(jar),
      body: JSON.stringify({ name: "bad number rotator", numbers: ["12345"] }), // too short
    });
    assertEqual(rotatorResult.status, 400, `rotator with an implausible number should be 400: ${JSON.stringify(rotatorResult.body)}`);

    const shortLinkResult = await http(jar!, "/api/shortlinks", {
      method: "POST",
      headers: await getOrigin(jar),
      body: JSON.stringify({ name: "bad number short link", phone: "123" }), // far too short
    });
    assertEqual(shortLinkResult.status, 400, `short link with an implausible number should be 400: ${JSON.stringify(shortLinkResult.body)}`);

    const adLinkResult = await http(jar!, "/api/adlinks", {
      method: "POST",
      headers: await getOrigin(jar),
      body: JSON.stringify({ name: "bad number ad link", number: "0000000000000000" }), // 16 digits, over the 15-digit E.164 bound
    });
    assertEqual(adLinkResult.status, 400, `ad link with an implausible number should be 400: ${JSON.stringify(adLinkResult.body)}`);
  });

  // --- D. Manual pause (owner feature, UX-1): pause -> /r|/w|/a redirects to
  // /link-paused?...reason=owner, click count unchanged; resume -> wa.me,
  // click count increments again. Uses realistic UAE numbers per the task.
  await check("D", "manual pause: pausing a rotator/short link/ad link stops routing (reason=owner, no click counted) and resuming restores it", async () => {
    const jar = planJars.get("pro");
    const user = planUsers.get("pro")!;
    assertTrue(!!jar, "need a logged-in pro user");

    const rotator = await prisma.rotatorLink.create({
      data: { userId: user.id, code: `E2EPAUSER${RUN}`, name: "pause probe rotator", numbers: ["971501110001"], fallbackNumber: "971501110001" },
    });
    const shortLink = await prisma.shortLink.create({ data: { userId: user.id, code: `e2epausesl${RUN}`, name: "pause probe short link", phone: "971501110002" } });
    const adLink = await prisma.adLink.create({ data: { userId: user.id, name: "pause probe ad link", number: "971501110003" } });
    try {
      // Pause all 3 via PATCH {paused:true}.
      const pauseRotator = await http(jar!, "/api/rotator", { method: "PATCH", headers: await getOrigin(jar), body: JSON.stringify({ id: rotator.id, paused: true }) });
      assertEqual(pauseRotator.status, 200, "PATCH pause rotator");
      const pauseShortLink = await http(jar!, "/api/shortlinks", { method: "PATCH", headers: await getOrigin(jar), body: JSON.stringify({ id: shortLink.id, paused: true }) });
      assertEqual(pauseShortLink.status, 200, "PATCH pause short link");
      const pauseAdLink = await http(jar!, "/api/adlinks", { method: "PATCH", headers: await getOrigin(jar), body: JSON.stringify({ id: adLink.id, paused: true }) });
      assertEqual(pauseAdLink.status, 200, "PATCH pause ad link");

      const rotatorClicksBefore = (await prisma.rotatorLink.findUnique({ where: { id: rotator.id } }))!.totalClicks;
      const shortLinkClicksBefore = (await prisma.shortLink.findUnique({ where: { id: shortLink.id } }))!.clicks;
      const adLinkClicksBefore = (await prisma.adLink.findUnique({ where: { id: adLink.id } }))!.clicks;

      const rRotator = await http(null, `/r/${rotator.code}`, { ip: "10.77.9.1" });
      assertTrue(rRotator.status === 307 || rRotator.status === 308, `paused rotator should still redirect, got ${rRotator.status}`);
      assertTrue((rRotator.location || "").includes("/link-paused") && (rRotator.location || "").includes("reason=owner"), `paused rotator should land on link-paused?reason=owner, got ${rRotator.location}`);

      const rShortLink = await http(null, `/w/${shortLink.code}`, { ip: "10.77.9.2" });
      assertTrue(rShortLink.status === 307 || rShortLink.status === 308, `paused short link should still redirect, got ${rShortLink.status}`);
      assertTrue((rShortLink.location || "").includes("/link-paused") && (rShortLink.location || "").includes("reason=owner"), `paused short link should land on link-paused?reason=owner, got ${rShortLink.location}`);

      const rAdLink = await http(null, `/a/${adLink.id}`, { ip: "10.77.9.3" });
      assertTrue(rAdLink.status === 307 || rAdLink.status === 308, `paused ad link should still redirect, got ${rAdLink.status}`);
      assertTrue((rAdLink.location || "").includes("/link-paused") && (rAdLink.location || "").includes("reason=owner"), `paused ad link should land on link-paused?reason=owner, got ${rAdLink.location}`);

      const rotatorClicksAfterPause = (await prisma.rotatorLink.findUnique({ where: { id: rotator.id } }))!.totalClicks;
      const shortLinkClicksAfterPause = (await prisma.shortLink.findUnique({ where: { id: shortLink.id } }))!.clicks;
      const adLinkClicksAfterPause = (await prisma.adLink.findUnique({ where: { id: adLink.id } }))!.clicks;
      assertEqual(rotatorClicksAfterPause, rotatorClicksBefore, "a paused rotator's click count must not change");
      assertEqual(shortLinkClicksAfterPause, shortLinkClicksBefore, "a paused short link's click count must not change");
      assertEqual(adLinkClicksAfterPause, adLinkClicksBefore, "a paused ad link's click count must not change");

      // Resume all 3 and confirm they route to wa.me again.
      const resumeRotator = await http(jar!, "/api/rotator", { method: "PATCH", headers: await getOrigin(jar), body: JSON.stringify({ id: rotator.id, paused: false }) });
      assertEqual(resumeRotator.status, 200, "PATCH resume rotator");
      const resumeShortLink = await http(jar!, "/api/shortlinks", { method: "PATCH", headers: await getOrigin(jar), body: JSON.stringify({ id: shortLink.id, paused: false }) });
      assertEqual(resumeShortLink.status, 200, "PATCH resume short link");
      const resumeAdLink = await http(jar!, "/api/adlinks", { method: "PATCH", headers: await getOrigin(jar), body: JSON.stringify({ id: adLink.id, paused: false }) });
      assertEqual(resumeAdLink.status, 200, "PATCH resume ad link");

      const rRotator2 = await http(null, `/r/${rotator.code}`, { ip: "10.77.9.4" });
      assertTrue((rRotator2.location || "").includes("wa.me"), `resumed rotator should route to wa.me, got ${rRotator2.location}`);
      const rShortLink2 = await http(null, `/w/${shortLink.code}`, { ip: "10.77.9.5" });
      assertTrue((rShortLink2.location || "").includes("wa.me"), `resumed short link should route to wa.me, got ${rShortLink2.location}`);
      const rAdLink2 = await http(null, `/a/${adLink.id}`, { ip: "10.77.9.6" });
      assertTrue((rAdLink2.location || "").includes("wa.me"), `resumed ad link should route to wa.me, got ${rAdLink2.location}`);
    } finally {
      await prisma.rotatorLink.deleteMany({ where: { id: rotator.id } });
      await prisma.shortLink.deleteMany({ where: { id: shortLink.id } });
      await prisma.adLink.deleteMany({ where: { id: adLink.id } });
    }
  });

  // --- D. Audit item 11: a deleted (not found) ad link must land on
  // /link-paused?reason=unavailable - never on the caller-supplied `?to=`
  // fallback, which is only meant for a genuine DB error/timeout. ---
  await check("D", "deleted ad link: /a/<id> goes to link-paused?reason=unavailable, ignoring ?to=", async () => {
    const r = await http(null, `/a/nonexistent-ad-link-${RUN}?to=${encodeURIComponent("https://wa.me/15550000000")}`, { ip: "10.77.9.11" });
    assertTrue(r.status === 307 || r.status === 308, `deleted ad link should still redirect, got ${r.status}`);
    assertTrue((r.location || "").includes("/link-paused") && (r.location || "").includes("reason=unavailable"), `deleted ad link should land on link-paused?reason=unavailable, got ${r.location}`);
    assertTrue(!(r.location || "").includes("wa.me"), `deleted ad link must NOT use the ?to= fallback, got ${r.location}`);
  });

  // --- D. Audit item 11: ad links must stop routing the moment the owner's
  // plan doesn't include them (live check, no cron needed) - e.g. a Solo
  // (basic) plan, which doesn't offer ad links at all. ---
  await check("D", "ad link on a plan without ad links (Solo): /a/<id> goes to link-paused?reason=plan even with no planPausedAt", async () => {
    const basicUser = planUsers.get("basic")!;
    const noAdLinksPlan = await prisma.adLink.create({ data: { userId: basicUser.id, name: "solo plan ad link probe", number: "971501110009" } });
    try {
      const r = await http(null, `/a/${noAdLinksPlan.id}`, { ip: "10.77.9.12" });
      assertTrue(r.status === 307 || r.status === 308, `ad link on a plan without ad links should still redirect, got ${r.status}`);
      assertTrue((r.location || "").includes("/link-paused") && (r.location || "").includes("reason=plan"), `ad link on Solo should land on link-paused?reason=plan, got ${r.location}`);
    } finally {
      await prisma.adLink.deleteMany({ where: { id: noAdLinksPlan.id } });
    }
  });

  // --- D. Grandfathering: over-limit existing item still works; PATCH that doesn't increase numbers is allowed ---
  await check("D", "grandfathering: over-limit rotator still routes, non-increasing PATCH allowed, increasing PATCH blocked", async () => {
    const basicUser = planUsers.get("basic")!;
    const basicJar = planJars.get("basic");
    assertTrue(!!basicJar, "need a logged-in basic user");
    const legacyNumbers = Array.from({ length: 5 }, (_, i) => `9198009${String(i).padStart(5, "0")}`); // 5 > basic's limit of 3
    const legacy = await prisma.rotatorLink.create({
      data: { userId: basicUser.id, code: `E2ELEGACY${RUN}`, name: "legacy over-limit", numbers: legacyNumbers, fallbackNumber: legacyNumbers[0] },
    });
    const routeResult = await http(null, `/r/${legacy.code}`, { ip: `10.77.0.1` });
    assertTrue(routeResult.status === 307 || routeResult.status === 308, `GET /r/${legacy.code} should redirect, got ${routeResult.status}`);
    assertTrue((routeResult.location || "").includes("wa.me"), `legacy rotator should still route to wa.me, got ${routeResult.location}`);

    const sameCountPatch = await http(basicJar!, "/api/rotator", {
      method: "PATCH",
      headers: await getOrigin(basicJar),
      body: JSON.stringify({ id: legacy.id, numbers: legacyNumbers.slice().reverse() }), // same count, reordered
    });
    assertEqual(sameCountPatch.status, 200, "PATCH keeping the same count should be allowed");

    const fewerPatch = await http(basicJar!, "/api/rotator", {
      method: "PATCH",
      headers: await getOrigin(basicJar),
      body: JSON.stringify({ id: legacy.id, numbers: legacyNumbers.slice(0, 2) }),
    });
    assertEqual(fewerPatch.status, 200, "PATCH reducing the count should be allowed");

    const increasePatch = await http(basicJar!, "/api/rotator", {
      method: "PATCH",
      headers: await getOrigin(basicJar),
      body: JSON.stringify({ id: legacy.id, numbers: legacyNumbers }), // back up to 5, > limit of 3
    });
    assertEqual(increasePatch.status, 403, "PATCH increasing the count past the plan limit should be refused");
  });

  // -------------------------------------------------------------------------
  // E. Salesperson names
  // -------------------------------------------------------------------------
  await check("E", "salesperson names: create with numberNames, GET returns them, PATCH removing a number prunes its name", async () => {
    const proJar = planJars.get("pro");
    assertTrue(!!proJar, "need a logged-in pro user");
    const numbers = ["919811100001", "919811100002"];
    const numberNames = { "919811100001": "Asha", "919811100002": "Rahul" };
    const createResult = await http(proJar!, "/api/rotator", {
      method: "POST",
      headers: await getOrigin(proJar),
      body: JSON.stringify({ name: "sales team", numbers, numberNames }),
    });
    assertEqual(createResult.status, 200, `create rotator with numberNames: ${JSON.stringify(createResult.body)}`);
    assertEqual(createResult.body.numberNames["919811100001"], "Asha", "numberNames should be stored");
    const id = createResult.body.id as string;

    const listResult = await http(proJar!, "/api/rotator");
    const found = (listResult.body.rotators as any[]).find((r) => r.id === id);
    assertTrue(!!found, "GET should return the created rotator");
    assertEqual(found.numberNames["919811100002"], "Rahul", "GET should return numberNames");

    const patchResult = await http(proJar!, "/api/rotator", {
      method: "PATCH",
      headers: await getOrigin(proJar),
      body: JSON.stringify({ id, numbers: ["919811100001"] }), // drop the second number
    });
    assertEqual(patchResult.status, 200, "PATCH removing a number");
    assertEqual(patchResult.body.numberNames["919811100001"], "Asha", "kept number's name should remain");
    assertEqual(patchResult.body.numberNames["919811100002"], undefined, "removed number's name should be pruned");
  });

  // -------------------------------------------------------------------------
  // F. Routing
  // -------------------------------------------------------------------------
  await check("F", "round-robin across 3 calls, each creates a ConversationStart with destination", async () => {
    const proUser = planUsers.get("pro")!;
    const numbers = ["919822200001", "919822200002", "919822200003"];
    const rotator = await prisma.rotatorLink.create({
      data: { userId: proUser.id, code: `E2ERR${RUN}`, name: "round robin", numbers, fallbackNumber: numbers[0] },
    });
    const before = await prisma.conversationStart.count({ where: { userId: proUser.id, assetType: "rotator" } });
    const destinations: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await http(null, `/r/${rotator.code}`, { ip: `10.77.1.${i + 1}` }); // distinct IP per call to avoid the speed limit
      assertTrue(r.status === 307 || r.status === 308, `call ${i}: expected redirect, got ${r.status}`);
      const m = (r.location || "").match(/wa\.me\/(\d+)/);
      assertTrue(!!m, `call ${i}: Location should point at wa.me, got ${r.location}`);
      destinations.push(m![1]);
    }
    assertEqual(new Set(destinations).size, 3, `round-robin should hit 3 distinct numbers, got ${destinations.join(",")}`);
    const after = await prisma.conversationStart.count({ where: { userId: proUser.id, assetType: "rotator" } });
    assertEqual(after - before, 3, "each successful redirect should create exactly one ConversationStart");
    const starts = await prisma.conversationStart.findMany({ where: { userId: proUser.id, assetType: "rotator", assetId: rotator.id }, orderBy: { createdAt: "asc" } });
    assertEqual(starts.length, 3, "3 ConversationStart rows for this rotator");
    for (const s of starts) assertTrue(!!s.destination, "each ConversationStart should record a destination");
  });

  await check("F", "free (no-trial) user is blocked from routing at all (Free-trial restructure: no 25-lead lifetime allowance any more)", async () => {
    const freeUser = planUsers.get("free")!;
    const rotator = await prisma.rotatorLink.create({
      data: { userId: freeUser.id, code: `E2EFREECAP${RUN}`, name: "free cap test", numbers: ["919833300001"], fallbackNumber: "919833300001" },
    });
    // No leads used at all - free/no-trial still blocks routing immediately.
    const r = await http(null, `/r/${rotator.code}`, { ip: "10.77.2.1" });
    assertTrue(r.status === 307 || r.status === 308, `expected redirect, got ${r.status}`);
    assertTrue((r.location || "").includes("/router-limit"), `free/no-trial user should land on /router-limit even at 0 leads used, got ${r.location}`);
  });

  await check("F", "trial user is allowed at 99 leads used, blocked at 100 (FEAT-TRIAL-100-LEADS)", async () => {
    const trialUser = await createDbUser("trial-cap", {
      plan: "free",
      trialPlan: "basic",
      trialStartedAt: new Date(Date.now() - 1 * 86_400_000),
      trialEndsAt: new Date(Date.now() + 2 * 86_400_000),
    });
    const rotator = await prisma.rotatorLink.create({
      data: { userId: trialUser.id, code: `E2ETRIALCAP${RUN}`, name: "trial cap test", numbers: ["919844400001"], fallbackNumber: "919844400001" },
    });
    // Seed 99 used leads: the 100th click should still be allowed (used < limit).
    await prisma.conversationStart.createMany({
      data: Array.from({ length: 99 }, () => ({ userId: trialUser.id, assetType: "rotator", assetId: rotator.id, destination: "919844400001" })),
    });
    const at99Used = await http(null, `/r/${rotator.code}`, { ip: "10.77.3.1" });
    assertTrue((at99Used.location || "").includes("wa.me"), `at 99 leads used, the trial's 100th lead should still route, got ${at99Used.location}`);
    // That click just consumed the 100th lead - the next one should be blocked.
    const at100Used = await http(null, `/r/${rotator.code}`, { ip: "10.77.3.2" });
    assertTrue((at100Used.location || "").includes("/router-limit"), `at 100 leads used, a trial user should land on /router-limit, got ${at100Used.location}`);
  });

  await check("F", "bot speed limit: >10 hits/min from one device still redirect but aren't counted", async () => {
    const proUser = planUsers.get("pro")!;
    const rotator = await prisma.rotatorLink.create({
      data: { userId: proUser.id, code: `E2EBOT${RUN}`, name: "bot speed test", numbers: ["919855500001"], fallbackNumber: "919855500001" },
    });
    const before = await prisma.conversationStart.count({ where: { userId: proUser.id, assetType: "rotator", assetId: rotator.id } });
    const sameIp = "10.77.4.1"; // same "device" for every call -> same rate-limit bucket
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const r = await http(null, `/r/${rotator.code}`, { ip: sameIp });
      statuses.push(r.status);
      assertTrue(r.status === 307 || r.status === 308, `bot call ${i}: visitor should never be blocked from the redirect itself, got ${r.status}`);
    }
    const after = await prisma.conversationStart.count({ where: { userId: proUser.id, assetType: "rotator", assetId: rotator.id } });
    const counted = after - before;
    assertTrue(counted <= 10, `only the first ~10/min should be counted as real leads, got ${counted} ConversationStart rows for 14 calls`);
    assertTrue(counted >= 1, "at least the first calls under the limit should still count");
  });

  // -------------------------------------------------------------------------
  // G. Results (UX-1 step 5: Reports + Performance merged into /results)
  // -------------------------------------------------------------------------
  await check("G", "free: /results shows the locked/choose-a-plan state (tier 'none')", async () => {
    const freeJar = planJars.get("free");
    const r = await http(freeJar!, "/results");
    assertEqual(r.status, 200, "GET /results as free");
    assertTrue(cleanHtml(r.text).includes("Choose a plan to see your results"), "free/no-trial user should see the locked results teaser");
  });

  await check("G", "solo: 'Basic · Solo' badge, no date picker, period chips present", async () => {
    const basicJar = planJars.get("basic");
    const r = await http(basicJar!, "/results");
    assertEqual(r.status, 200, "GET /results as basic");
    assertTrue(cleanHtml(r.text).includes("Basic · Solo"), "basic user should see the 'Basic · Solo' tier badge");
    assertTrue(!r.text.includes('type="date"'), "basic user should not see a custom date picker");
    assertTrue(r.text.includes("Today") && r.text.includes("7 days") && r.text.includes("30 days"), "basic user should still see the period chips");
  });

  await check("G", "growth: 'Full · Growth' badge, custom from/to works, tabs render", async () => {
    const proJar = planJars.get("pro");
    const r = await http(proJar!, "/results");
    assertEqual(r.status, 200, "GET /results as pro");
    assertTrue(cleanHtml(r.text).includes("Full · Growth"), "pro user should see the 'Full · Growth' tier badge");
    assertTrue(r.text.includes('type="date"'), "pro user should see a custom date picker");
    const fromDate = dateDaysAgo(16);
    const toDate = dateDaysAgo(1);
    const customResult = await http(proJar!, `/results?from=${fromDate}&to=${toDate}`);
    assertEqual(customResult.status, 200, "custom from/to range should load for a Growth user");
    assertTrue(customResult.text.includes(fromDate), "custom range should echo the chosen from date");

    for (const tab of ["overview", "salesperson", "source", "link"]) {
      const tabResult = await http(proJar!, `/results?tab=${tab}`);
      assertEqual(tabResult.status, 200, `GET /results?tab=${tab} as pro`);
    }
  });

  await check("G", "agency: /results?link= filter narrows to one link", async () => {
    const ultimateJar = planJars.get("ultimate");
    const ultimateUser = planUsers.get("ultimate")!;
    assertTrue(!!ultimateJar, "need a logged-in ultimate user");
    const filterRotator = await prisma.rotatorLink.create({
      data: { userId: ultimateUser.id, code: `E2EFILTER${RUN}`, name: "link filter probe", numbers: ["919800169999"], fallbackNumber: "919800169999" },
    });
    try {
      const r = await http(ultimateJar!, `/results?tab=link&link=rotator:${filterRotator.id}`);
      assertEqual(r.status, 200, "GET /results?tab=link&link=rotator:<id> as ultimate");
      assertTrue(r.text.includes("link filter probe"), "the filtered link's name should still appear on the By-link tab");
    } finally {
      await prisma.rotatorLink.deleteMany({ where: { id: filterRotator.id } });
    }
  });

  await check("G", "CSV export: free 403, solo works, growth with from/to works and includes the salesperson column", async () => {
    const freeResult = await http(planJars.get("free")!, "/api/reports/export");
    assertEqual(freeResult.status, 403, "CSV export should be refused for free");

    const basicResult = await http(planJars.get("basic")!, "/api/reports/export");
    assertEqual(basicResult.status, 200, "CSV export should work for solo");
    assertTrue(basicResult.text.startsWith("date,"), "CSV should start with a header row");

    // Give the pro user a named-salesperson chat to export.
    const proUser = planUsers.get("pro")!;
    const proWorkspace = await getActiveWorkspace(proUser.id);
    const named = await prisma.rotatorLink.create({
      data: {
        userId: proUser.id,
        code: `E2ECSV${RUN}`,
        name: "csv export rotator",
        numbers: ["919866600001"],
        fallbackNumber: "919866600001",
        numberNames: { "919866600001": "Priya" },
      },
    });
    await prisma.conversationStart.create({
      data: { userId: proUser.id, workspaceId: proWorkspace.workspaceId, assetType: "rotator", assetId: named.id, assetName: named.name, destination: "919866600001" },
    });
    const proResult = await http(planJars.get("pro")!, `/api/reports/export?from=${dateDaysAgo(16)}&to=${dateDaysAgo(0)}`);
    assertEqual(proResult.status, 200, "CSV export should work for growth with from/to");
    assertTrue(proResult.text.toLowerCase().includes("salesperson"), "CSV header should include the salesperson column");
    assertTrue(proResult.text.includes("Priya"), "CSV should include the salesperson's name for the routed chat");
  });

  // -------------------------------------------------------------------------
  // H. Performance -> merged into /results (Overview tab); the free-trial-
  // ended paused state itself now shows on /dashboard, not on /results
  // (which just shows the generic "choose a plan" lock, covered in G above).
  // -------------------------------------------------------------------------
  await check("H", "free (no-trial) user: /dashboard shows 'your free trial has ended — your links are paused'", async () => {
    const r = await http(planJars.get("free")!, "/dashboard");
    assertEqual(r.status, 200, "GET /dashboard as free");
    assertTrue(/free trial has ended/i.test(cleanHtml(r.text)), "free/no-trial user should see the trial-ended paused banner on /dashboard");
  });

  await check("H", "trial user: /results (Overview tab) shows 'X of 100 trial leads used · N day(s) left'", async () => {
    const trialJar = await loggedInJar(emailFor("trial-cap"));
    const r = await http(trialJar, "/results");
    assertEqual(r.status, 200, "GET /results as trial user");
    assertTrue(/\d+ of 100 trial leads used\s*·\s*\d+ days? left/i.test(cleanHtml(r.text)), "trial user should see the trial leads-used meter on the Overview tab");
  });

  // -------------------------------------------------------------------------
  // I. Account: export + close/cancel
  // -------------------------------------------------------------------------
  await check("I", "account data export returns JSON including rotators", async () => {
    const r = await http(planJars.get("pro")!, "/api/account/export");
    assertEqual(r.status, 200, "GET /api/account/export");
    assertTrue(Array.isArray(r.body?.rotators), "export JSON should include a rotators array");
  });

  await check("I", "close-account request + cancel within grace works", async () => {
    const jar = planJars.get("ultimate")!;
    const codeResult = await requestConfirmCode(jar);
    assertEqual(codeResult.status, 200, `requesting a confirm code should succeed: ${JSON.stringify(codeResult.body)}`);
    const email = emailFor("plan-ultimate");
    const code = await waitForCode(email, "confirm");
    const closeResult = await http(jar, "/api/account/lifecycle", {
      method: "POST",
      headers: await getOrigin(jar),
      body: JSON.stringify({ action: "request_deletion", confirmation: "DELETE MY WAZAP ACCOUNT", emailCode: code }),
    });
    assertEqual(closeResult.status, 200, `request_deletion should succeed: ${JSON.stringify(closeResult.body)}`);
    assertTrue(closeResult.body.scheduled === true, "closure should be scheduled");

    const statusResult = await http(jar, "/api/account/lifecycle");
    assertTrue(!!statusResult.body.scheduledFor, "status should show a scheduled closure");

    const cancelResult = await http(jar, "/api/account/lifecycle", {
      method: "POST",
      headers: await getOrigin(jar),
      body: JSON.stringify({ action: "cancel_deletion" }),
    });
    assertEqual(cancelResult.status, 200, "cancel_deletion should succeed");
    assertTrue(cancelResult.body.restored === true, "cancellation should restore the account");

    const finalUser = await prisma.user.findUnique({ where: { id: planUsers.get("ultimate")!.id } });
    assertEqual(finalUser!.accountDeletionScheduledFor, null, "scheduled closure should be cleared after cancel");
  });

  // -------------------------------------------------------------------------
  // J. Crons
  // -------------------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    skip("J", "expire-plans: expired paid user -> free", "CRON_SECRET not configured in .env");
    skip("J", "trial-lifecycle: reminder + expired funnel event", "CRON_SECRET not configured in .env");
    skip("J", "expire-plans: pauses extras for a user whose trial just ended", "CRON_SECRET not configured in .env");
  } else {
    await check("J", "expire-plans: expired paid user is downgraded back to free", async () => {
      const expiredPaid = await createDbUser("expired-paid", { plan: "pro", planExpiresAt: new Date(Date.now() - 60_000) });
      const r = await http(null, "/api/cron/expire-plans", { headers: { Authorization: `Bearer ${cronSecret}` } });
      assertEqual(r.status, 200, `cron call: ${JSON.stringify(r.body)}`);
      const after = await prisma.user.findUnique({ where: { id: expiredPaid.id } });
      assertEqual(after!.plan, "free", "expired paid user should be back on free");
      assertEqual(after!.planExpiresAt, null, "planExpiresAt should be cleared");
    });

    await check("J", "trial-lifecycle: queues a reminder email and records trial_expired", async () => {
      // Audit item 9: the "ending" reminder now only fires with <= 1 day
      // left, not right after sign-up - so this trial must be inside that
      // 1-day window, not the old 3-day one.
      const endingSoon = await createDbUser("trial-ending-soon", {
        plan: "free",
        trialPlan: "basic",
        trialStartedAt: new Date(Date.now() - 2 * 86_400_000),
        trialEndsAt: new Date(Date.now() + 12 * 3_600_000),
      });
      const justExpired = await createDbUser("trial-just-expired", {
        plan: "free",
        trialPlan: "basic",
        trialStartedAt: new Date(Date.now() - 3 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 60_000),
      });
      // Audit item 9: a brand-new trial (3 days left, right after sign-up)
      // must NOT get the "ending" reminder yet.
      const brandNewTrial = await createDbUser("trial-brand-new", {
        plan: "free",
        trialPlan: "basic",
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 3 * 86_400_000),
      });
      const r = await http(null, "/api/cron/trial-lifecycle", { headers: { Authorization: `Bearer ${cronSecret}` } });
      assertEqual(r.status, 200, `cron call: ${JSON.stringify(r.body)}`);
      const reminderEmail = await prisma.outboundEmail.findFirst({ where: { userId: endingSoon.id, type: "trial_ending" } });
      assertTrue(!!reminderEmail, "a trial_ending reminder email should be queued");
      const refreshed = await prisma.user.findUnique({ where: { id: endingSoon.id } });
      assertTrue(!!refreshed!.trialReminderSentAt, "trialReminderSentAt should be set");
      const expiredEvent = await prisma.funnelEvent.findFirst({ where: { userId: justExpired.id, name: "trial_expired" } });
      assertTrue(!!expiredEvent, "a trial_expired funnel event should be recorded");
      const noEarlyReminder = await prisma.outboundEmail.findFirst({ where: { userId: brandNewTrial.id, type: "trial_ending" } });
      assertTrue(!noEarlyReminder, "a brand-new trial (3 days left) should not get the ending reminder yet");
    });

    await check("J", "expire-plans: pauses ALL rotators once the Free trial ends (Free-trial restructure: free is 0 of everything)", async () => {
      // The cron's free/no-trial sweep no longer depends on isNewStyleTrial
      // or a lookback window - it matches ANY plan:"free" user who still has
      // an un-paused link, however long ago their trial ended.
      const trialEndedUser = await createDbUser("trial-ended-pause", {
        plan: "free",
        trialPlan: "basic", // Solo-level link pool (5) while the trial ran
        trialStartedAt: new Date(Date.now() - 4 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 1 * 86_400_000),
      });
      // 3 rotators, legitimately created while the Solo-level trial boost was active.
      const rotators = await Promise.all(
        [0, 1, 2].map((i) =>
          prisma.rotatorLink.create({
            data: { userId: trialEndedUser.id, code: `E2EPAUSE${RUN}${i}`, name: `trial rotator ${i}`, numbers: ["919877700001"], fallbackNumber: "919877700001" },
          }),
        ),
      );
      const r = await http(null, "/api/cron/expire-plans", { headers: { Authorization: `Bearer ${cronSecret}` } });
      assertEqual(r.status, 200, `cron call: ${JSON.stringify(r.body)}`);
      const after = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
      const pausedCount = after.filter((row) => row.planPausedAt !== null).length;
      // Free plan's rotator limit is now 0, so all 3 should be paused.
      assertEqual(pausedCount, 3, `expected all 3 rotators paused once back on free (limit 0), got ${pausedCount}`);
      const activeCount = after.filter((row) => row.planPausedAt === null).length;
      assertEqual(activeCount, 0, "no rotator should remain active on free/no-trial");
    });
  }

  // -------------------------------------------------------------------------
  // M. Plan pausing end-to-end: a trial-ended user's links pause (and /r,
  // /w redirect to /link-paused), a simulated paid activation resumes them
  // via the same lib/plan-limit-sync.ts call the admin "activate" endpoint
  // (app/api/admin/activate/route.ts) and every payment webhook
  // (lib/payment-integrity.ts) rely on, and a currently-paid user is left
  // alone by the cron.
  // -------------------------------------------------------------------------
  if (!cronSecret) {
    skip("M", "plan pause: trial-ended links pause and /r,/w redirect to /link-paused", "CRON_SECRET not configured in .env");
    skip("M", "plan pause: a currently-paid user's links are not paused by expire-plans", "CRON_SECRET not configured in .env");
  } else {
    await check("M", "plan pause: trial-ended user's links pause, /r+/w redirect to /link-paused, and a simulated paid activation resumes them", async () => {
      const user = await createDbUser("pause-flow", {
        plan: "free",
        trialPlan: "basic",
        trialStartedAt: new Date(Date.now() - 4 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 1 * 86_400_000), // trial ended yesterday
      });
      const rotator = await prisma.rotatorLink.create({
        data: { userId: user.id, code: `E2EPLANPAUSE${RUN}`, name: "plan pause rotator", numbers: ["919888800001"], fallbackNumber: "919888800001" },
      });
      const shortLink = await prisma.shortLink.create({ data: { userId: user.id, code: `e2eplanpausesl${RUN}`, name: "plan pause short link", phone: "919888800002" } });

      const cronResult = await http(null, "/api/cron/expire-plans", { headers: { Authorization: `Bearer ${cronSecret}` } });
      assertEqual(cronResult.status, 200, `cron call: ${JSON.stringify(cronResult.body)}`);

      const rotatorAfter = await prisma.rotatorLink.findUnique({ where: { id: rotator.id } });
      const shortLinkAfter = await prisma.shortLink.findUnique({ where: { id: shortLink.id } });
      assertTrue(!!rotatorAfter!.planPausedAt, "rotator should be plan-paused once the trial ended");
      assertTrue(!!shortLinkAfter!.planPausedAt, "short link should be plan-paused once the trial ended");

      const rRotator = await http(null, `/r/${rotator.code}`, { ip: "10.77.20.1" });
      assertTrue(rRotator.status === 307 || rRotator.status === 308, `paused rotator should still redirect, got ${rRotator.status}`);
      assertTrue(
        (rRotator.location || "").includes("/link-paused") && !(rRotator.location || "").includes("reason=owner"),
        `plan-paused rotator should land on /link-paused without reason=owner, got ${rRotator.location}`,
      );

      const rShortLink = await http(null, `/w/${shortLink.code}`, { ip: "10.77.20.2" });
      assertTrue(rShortLink.status === 307 || rShortLink.status === 308, `paused short link should still redirect, got ${rShortLink.status}`);
      assertTrue(
        (rShortLink.location || "").includes("/link-paused") && !(rShortLink.location || "").includes("reason=owner"),
        `plan-paused short link should land on /link-paused without reason=owner, got ${rShortLink.location}`,
      );

      // Simulate a successful paid activation exactly the way the app does
      // it: update plan/planExpiresAt, then call lib/plan-limit-sync.ts's
      // syncPlanLimits with the plan read BEFORE the change - the same two
      // steps as app/api/admin/activate/route.ts's POST handler (and what
      // lib/payment-integrity.ts's recordVerifiedCharge/applyVerifiedLifecycle
      // also do after a verified webhook charge).
      const before = await prisma.user.findUnique({ where: { id: user.id }, select: { plan: true } });
      await prisma.user.update({ where: { id: user.id }, data: { plan: "basic", planExpiresAt: new Date(Date.now() + 30 * 86_400_000) } });
      await syncPlanLimits(user.id, before!.plan);

      const rotatorResumed = await prisma.rotatorLink.findUnique({ where: { id: rotator.id } });
      const shortLinkResumed = await prisma.shortLink.findUnique({ where: { id: shortLink.id } });
      assertEqual(rotatorResumed!.planPausedAt, null, "rotator should resume (planPausedAt cleared) after paid activation");
      assertEqual(shortLinkResumed!.planPausedAt, null, "short link should resume (planPausedAt cleared) after paid activation");

      const rRotator2 = await http(null, `/r/${rotator.code}`, { ip: "10.77.20.3" });
      assertTrue((rRotator2.location || "").includes("wa.me"), `resumed rotator should route to wa.me, got ${rRotator2.location}`);
      const rShortLink2 = await http(null, `/w/${shortLink.code}`, { ip: "10.77.20.4" });
      assertTrue((rShortLink2.location || "").includes("wa.me"), `resumed short link should route to wa.me, got ${rShortLink2.location}`);
    });

    await check("M", "plan pause: a currently-paid (non-expired) user's links are not paused by expire-plans", async () => {
      const user = await createDbUser("pause-flow-paid", { plan: "pro", planExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
      const rotator = await prisma.rotatorLink.create({
        data: { userId: user.id, code: `E2EPLANPAID${RUN}`, name: "paid user rotator", numbers: ["919888800003"], fallbackNumber: "919888800003" },
      });
      const cronResult = await http(null, "/api/cron/expire-plans", { headers: { Authorization: `Bearer ${cronSecret}` } });
      assertEqual(cronResult.status, 200, `cron call: ${JSON.stringify(cronResult.body)}`);
      const after = await prisma.rotatorLink.findUnique({ where: { id: rotator.id } });
      assertEqual(after!.planPausedAt, null, "a currently-paid user's rotator must not be paused by expire-plans");
      const r = await http(null, `/r/${rotator.code}`, { ip: "10.77.20.5" });
      assertTrue((r.location || "").includes("wa.me"), `paid user's rotator should still route to wa.me, got ${r.location}`);
    });
  }

  // -------------------------------------------------------------------------
  // N. Support tickets (customer HTTP flow, SUPPORT-2 - no AI, ticket-based).
  // -------------------------------------------------------------------------
  const visitorAJar = new Jar();
  let visitorAId = "";
  let ticketLinkId = "";
  let ticketLinkNumber = "";
  let ticketAccountId = "";

  await check("N", "support profile: GET issues a support session cookie, POST saves the visitor's profile", async () => {
    const getResult = await http(visitorAJar, "/api/support/profile");
    assertEqual(getResult.status, 200, `GET /api/support/profile: ${JSON.stringify(getResult.body)}`);
    assertEqual(getResult.body.ready, false, "a brand-new visitor should not be ready yet");
    assertTrue(!!getResult.body.visitorId, "GET should hand back a visitorId");
    assertTrue(visitorAJar.cookies.has("__Host-wazap-support"), "GET should set the __Host-wazap-support cookie");
    visitorAId = getResult.body.visitorId;
    trackVisitor(visitorAId);

    const email = emailFor("support-visitor-a");
    trackEmail(email);
    const postResult = await http(visitorAJar, "/api/support/profile", {
      method: "POST",
      headers: await getOrigin(visitorAJar),
      body: JSON.stringify({ visitorId: visitorAId, name: "E2E Visitor A", email, phone: "+971501110000" }),
    });
    assertEqual(postResult.status, 201, `POST /api/support/profile: ${JSON.stringify(postResult.body)}`);
    assertEqual(postResult.body.ready, true, "profile save should report ready:true");
  });

  await check("N", "quick answers: GET per topic returns the static list; personal facts only for a logged-in user", async () => {
    const loggedOut = await http(null, "/api/support/quick-answers?topic=payment");
    assertEqual(loggedOut.status, 200, "GET /api/support/quick-answers?topic=payment");
    assertTrue(Array.isArray(loggedOut.body.answers) && loggedOut.body.answers.length > 0, "payment topic should have quick answers");
    assertEqual(loggedOut.body.personal, null, "a logged-out visitor should not get personal facts");

    const proJar = planJars.get("pro")!;
    const loggedIn = await http(proJar, "/api/support/quick-answers?topic=payment");
    assertEqual(loggedIn.status, 200, "GET /api/support/quick-answers?topic=payment (logged in)");
    assertTrue(!!loggedIn.body.personal && Array.isArray(loggedIn.body.personal.sentences), "a logged-in user should get personal facts for the payment topic");

    const accountTopic = await http(proJar, "/api/support/quick-answers?topic=account");
    assertEqual(accountTopic.body.personal, null, "personal facts are only for payment/link topics, not account");
  });

  await check("N", "create ticket: duplicate topic returns 'existing', differentProblem:true creates a new one", async () => {
    const create1 = await http(visitorAJar, "/api/support/tickets", {
      method: "POST",
      headers: await getOrigin(visitorAJar),
      body: JSON.stringify({ visitorId: visitorAId, topic: "link", message: "My short link opens the wrong number" }),
    });
    assertEqual(create1.status, 201, `create ticket 1: ${JSON.stringify(create1.body)}`);
    assertTrue(!!create1.body.ticket?.number, "created ticket should have a number");
    ticketLinkId = create1.body.ticket.id;
    ticketLinkNumber = create1.body.ticket.number;
    assertEqual(create1.body.ticket.urgent, true, "the 'link' topic is always urgent");

    const duplicate = await http(visitorAJar, "/api/support/tickets", {
      method: "POST",
      headers: await getOrigin(visitorAJar),
      body: JSON.stringify({ visitorId: visitorAId, topic: "link", message: "Still the same problem" }),
    });
    assertEqual(duplicate.status, 200, `duplicate-topic create: ${JSON.stringify(duplicate.body)}`);
    assertEqual(duplicate.body.existing?.id, ticketLinkId, "a second ticket on the same open topic should return the existing one, not create a new one");

    const differentProblem = await http(visitorAJar, "/api/support/tickets", {
      method: "POST",
      headers: await getOrigin(visitorAJar),
      body: JSON.stringify({ visitorId: visitorAId, topic: "link", message: "A second, different link problem", differentProblem: true }),
    });
    assertEqual(differentProblem.status, 201, `differentProblem create: ${JSON.stringify(differentProblem.body)}`);
    assertTrue(differentProblem.body.ticket.id !== ticketLinkId, "differentProblem:true should create a genuinely new ticket");

    // Also raise the "account" topic ticket used by the closed-ticket check below.
    const accountCreate = await http(visitorAJar, "/api/support/tickets", {
      method: "POST",
      headers: await getOrigin(visitorAJar),
      body: JSON.stringify({ visitorId: visitorAId, topic: "account", message: "Can't change my email" }),
    });
    assertEqual(accountCreate.status, 201, `create account ticket: ${JSON.stringify(accountCreate.body)}`);
    ticketAccountId = accountCreate.body.ticket.id;
  });

  await check("N", "list + detail: GET /api/support/tickets and /api/support/tickets/[id] return only this visitor's tickets", async () => {
    const list = await http(visitorAJar, `/api/support/tickets?visitorId=${visitorAId}`);
    assertEqual(list.status, 200, "GET /api/support/tickets");
    assertTrue(list.body.tickets.length >= 3, `expected at least 3 tickets for visitor A, got ${list.body.tickets.length}`);
    assertTrue(list.body.tickets.some((t: { id: string }) => t.id === ticketLinkId), "list should include the first link ticket");

    const detail = await http(visitorAJar, `/api/support/tickets/${ticketLinkId}?visitorId=${visitorAId}`);
    assertEqual(detail.status, 200, "GET /api/support/tickets/[id]");
    assertTrue(
      detail.body.ticket.messages.some((m: { sender: string; body: string }) => m.sender === "bot" && m.body.includes(`Ticket #${ticketLinkNumber} received`)),
      "detail should include the 'Ticket received' system message",
    );
    assertTrue(detail.body.ticket.messages.some((m: { sender: string }) => m.sender === "visitor"), "detail should include the visitor's own first message");
  });

  await check("N", "send message, staff reply (lib staffReply), unread count, reopen within 7 days", async () => {
    const sendResult = await http(visitorAJar, `/api/support/tickets/${ticketLinkId}/messages`, {
      method: "POST",
      headers: await getOrigin(visitorAJar),
      body: JSON.stringify({ visitorId: visitorAId, message: "Any update?" }),
    });
    assertEqual(sendResult.status, 200, `customer message: ${JSON.stringify(sendResult.body)}`);
    assertEqual(sendResult.body.status, "open", "an open ticket stays open after another customer message");

    const staffResult = await libStaffReply(ticketLinkId, "e2e-admin", "We're looking into it.", "waiting");
    assertEqual(staffResult.kind, "ok", `staffReply: ${JSON.stringify(staffResult)}`);

    const unreadAfterReply = await http(visitorAJar, `/api/support/unread?visitorId=${visitorAId}`);
    assertEqual(unreadAfterReply.status, 200, "GET /api/support/unread");
    assertTrue(unreadAfterReply.body.unread >= 1, `expected at least 1 unread admin message, got ${unreadAfterReply.body.unread}`);

    const detailAfterReply = await http(visitorAJar, `/api/support/tickets/${ticketLinkId}?visitorId=${visitorAId}`);
    assertEqual(detailAfterReply.body.ticket.status, "waiting", "ticket should move to 'waiting' after a staff reply with the default next-status");
    assertTrue(detailAfterReply.body.ticket.messages.some((m: { sender: string }) => m.sender === "admin"), "detail should include the admin's reply");

    const unreadAfterRead = await http(visitorAJar, `/api/support/unread?visitorId=${visitorAId}`);
    assertEqual(unreadAfterRead.body.unread, 0, "fetching the ticket detail should mark the admin message as read, so unread drops back to 0");

    const solveResult = await libStaffReply(ticketLinkId, "e2e-admin", "This should be fixed now.", "solved");
    assertEqual(solveResult.kind, "ok", `staffReply (solve): ${JSON.stringify(solveResult)}`);
    const solvedDetail = await http(visitorAJar, `/api/support/tickets/${ticketLinkId}?visitorId=${visitorAId}`);
    assertEqual(solvedDetail.body.ticket.status, "solved", "ticket should be 'solved' after staffReply with nextStatus solved");
    assertTrue(solvedDetail.body.ticket.canReopen, "a just-solved ticket should still be within the 7-day reopen window");

    const reopenResult = await http(visitorAJar, `/api/support/tickets/${ticketLinkId}/reopen`, {
      method: "POST",
      headers: await getOrigin(visitorAJar),
      body: JSON.stringify({ visitorId: visitorAId }),
    });
    assertEqual(reopenResult.status, 200, `reopen: ${JSON.stringify(reopenResult.body)}`);
    const reopenedDetail = await http(visitorAJar, `/api/support/tickets/${ticketLinkId}?visitorId=${visitorAId}`);
    assertEqual(reopenedDetail.body.ticket.status, "open", "a customer reopen within 7 days should bring the ticket back to 'open'");
  });

  await check("N", "closed ticket rejects new customer messages", async () => {
    // A fresh visitor/jar here (not visitorA, which has already used several
    // of its 5-messages/minute burst-limit slots in the checks above) so
    // this one 409 assertion isn't masked by an unrelated 429.
    const closedVisitorJar = new Jar();
    const profileGet = await http(closedVisitorJar, "/api/support/profile");
    const closedVisitorId = profileGet.body.visitorId as string;
    trackVisitor(closedVisitorId);
    const closedVisitorEmail = emailFor("support-visitor-closed");
    trackEmail(closedVisitorEmail);
    await http(closedVisitorJar, "/api/support/profile", {
      method: "POST",
      headers: await getOrigin(closedVisitorJar),
      body: JSON.stringify({ visitorId: closedVisitorId, name: "E2E Visitor Closed", email: closedVisitorEmail, phone: "+971501110002" }),
    });
    const created = await http(closedVisitorJar, "/api/support/tickets", {
      method: "POST",
      headers: await getOrigin(closedVisitorJar),
      body: JSON.stringify({ visitorId: closedVisitorId, topic: "account", message: "Can't change my email" }),
    });
    assertEqual(created.status, 201, `create ticket for closed-ticket check: ${JSON.stringify(created.body)}`);
    const closedTicketId = created.body.ticket.id as string;
    await prisma.supportTicket.update({ where: { id: closedTicketId }, data: { status: "closed", closedAt: new Date() } });

    const result = await http(closedVisitorJar, `/api/support/tickets/${closedTicketId}/messages`, {
      method: "POST",
      headers: await getOrigin(closedVisitorJar),
      body: JSON.stringify({ visitorId: closedVisitorId, message: "Hello?" }),
    });
    assertEqual(result.status, 409, `message on a closed ticket: ${JSON.stringify(result.body)}`);
    assertTrue(/closed/i.test(result.body.error || ""), `expected a 'closed' error message, got ${JSON.stringify(result.body)}`);
  });

  await check("N", "another visitor gets 404 reading someone else's ticket", async () => {
    const visitorBJar = new Jar();
    const getResult = await http(visitorBJar, "/api/support/profile");
    const visitorBId = getResult.body.visitorId as string;
    trackVisitor(visitorBId);
    const emailB = emailFor("support-visitor-b");
    trackEmail(emailB);
    await http(visitorBJar, "/api/support/profile", {
      method: "POST",
      headers: await getOrigin(visitorBJar),
      body: JSON.stringify({ visitorId: visitorBId, name: "E2E Visitor B", email: emailB, phone: "+971501110001" }),
    });
    const result = await http(visitorBJar, `/api/support/tickets/${ticketLinkId}?visitorId=${visitorBId}`);
    assertEqual(result.status, 404, `visitor B reading visitor A's ticket: ${JSON.stringify(result.body)}`);
  });

  await check("N", "WhatsApp support availability: Solo -> plan, Growth -> available", async () => {
    const soloResult = await http(planJars.get("basic")!, "/api/support/whatsapp");
    assertEqual(soloResult.status, 200, "GET /api/support/whatsapp (solo)");
    assertEqual(soloResult.body.available, false, "Solo should not get WhatsApp support");
    assertEqual(soloResult.body.reason, "plan", "Solo's reason should be 'plan'");

    const growthResult = await http(planJars.get("pro")!, "/api/support/whatsapp");
    assertEqual(growthResult.status, 200, "GET /api/support/whatsapp (growth)");
    assertEqual(growthResult.body.available, true, "Growth should get WhatsApp support (SUPPORT_WHATSAPP_NUMBER is set locally)");
    assertTrue(
      typeof growthResult.body.url === "string" && growthResult.body.url.includes("wa.me/971585580053"),
      `expected a wa.me url with the configured number, got ${growthResult.body.url}`,
    );
  });

  await check("N", "quick-answer feedback: POST records a row", async () => {
    const answerId = `e2e-${RUN}-pay-not-active`;
    const result = await http(visitorAJar, "/api/support/quick-answers/feedback", {
      method: "POST",
      headers: await getOrigin(visitorAJar),
      body: JSON.stringify({ answerId, solved: true }),
    });
    assertEqual(result.status, 200, `feedback POST: ${JSON.stringify(result.body)}`);
    const row = await prisma.supportAnswerFeedback.findFirst({ where: { answerId } });
    assertTrue(!!row, "feedback row should be recorded");
    assertEqual(row!.solved, true, "feedback 'solved' should be stored as sent");
  });

  await check("N", "contact form honeypot: filled honeypot returns ok but stores nothing", async () => {
    const email = emailFor("contact-honeypot");
    const before = await prisma.contactMessage.count({ where: { email } });
    const result = await http(null, "/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify({ name: "Bot", email, subject: "general", message: "buy cheap stuff", company_website: "http://spam.example" }),
    });
    assertEqual(result.status, 201, `honeypot POST: ${JSON.stringify(result.body)}`);
    assertEqual(result.body.ok, true, "honeypot response should still say ok:true");
    const after = await prisma.contactMessage.count({ where: { email } });
    assertEqual(after, before, "a filled honeypot must not create a ContactMessage row");
  });

  // -------------------------------------------------------------------------
  // O. Additional customer pages: /support/tickets, /contact (logged-in),
  // and each /links/new/* type form.
  // -------------------------------------------------------------------------
  await check("O", "/support/tickets redirects to /login when logged out, 200 when logged in", async () => {
    const loggedOut = await http(null, "/support/tickets");
    const isHttpRedirect = (loggedOut.status === 307 || loggedOut.status === 308) && (loggedOut.location || "").includes("/login");
    const isStreamRedirect = loggedOut.status === 200 && loggedOut.text.includes("NEXT_REDIRECT") && loggedOut.text.includes("/login");
    assertTrue(isHttpRedirect || isStreamRedirect, `GET /support/tickets (logged out) should redirect to /login, got ${loggedOut.status}`);

    const loggedIn = await http(planJars.get("pro")!, "/support/tickets");
    assertEqual(loggedIn.status, 200, "GET /support/tickets (logged in)");
  });

  await check("O", "/contact renders 200 for a logged-in user too", async () => {
    const r = await http(planJars.get("pro")!, "/contact");
    assertEqual(r.status, 200, "GET /contact (logged in)");
  });

  await check("O", "each link-type create form loads 200 for a logged-in user with room in their pool", async () => {
    const jar = planJars.get("ultimate")!;
    for (const path of ["/links/new/rotator", "/links/new/brand", "/links/new/ad"]) {
      const r = await http(jar, path);
      assertEqual(r.status, 200, `GET ${path} as ultimate`);
    }
  });

  // -------------------------------------------------------------------------
  // P. Local price API: timezone -> country -> currency (estimated local
  // prices use this; countryForRequest returns null for a loopback test
  // request, so the timeZone -> country table in app/api/localization/
  // route.ts is what actually decides it here).
  // -------------------------------------------------------------------------
  await check("P", "GET /api/localization: Asia/Calcutta and Asia/Kolkata -> INR, America/New_York -> USD", async () => {
    const calcutta = await http(null, "/api/localization?timeZone=Asia/Calcutta");
    assertEqual(calcutta.status, 200, "GET /api/localization?timeZone=Asia/Calcutta");
    assertEqual(calcutta.body.currency, "INR", `Asia/Calcutta should resolve to INR, got ${JSON.stringify(calcutta.body)}`);

    const kolkata = await http(null, "/api/localization?timeZone=Asia/Kolkata");
    assertEqual(kolkata.status, 200, "GET /api/localization?timeZone=Asia/Kolkata");
    assertEqual(kolkata.body.currency, "INR", `Asia/Kolkata should resolve to INR, got ${JSON.stringify(kolkata.body)}`);

    const ny = await http(null, "/api/localization?timeZone=America/New_York");
    assertEqual(ny.status, 200, "GET /api/localization?timeZone=America/New_York");
    assertEqual(ny.body.currency, "USD", `America/New_York should resolve to USD, got ${JSON.stringify(ny.body)}`);
  });

  // -------------------------------------------------------------------------
  // K. Support flow check - removed. scripts/support-flow-check.ts tested
  // the old "AI first, human when needed" chat/handoff flow, which SUPPORT-2
  // retired in favour of tickets; that script and its AI-era dependencies
  // (lib/support-chat-service.ts, lib/support-handoff.ts) were deleted.
  // Equivalent coverage for the ticket flow lives in
  // tests/integration/support-tickets.test.ts.
  // -------------------------------------------------------------------------
  // L. Unit + DB integration tests
  // -------------------------------------------------------------------------
  await check("L", "npx vitest run (unit tests, DB-free)", async () => {
    const { execSync } = await import("node:child_process");
    try {
      const out = execSync("npx vitest run", { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" });
      console.log(out.split("\n").slice(-15).join("\n"));
    } catch (err: any) {
      console.log((err.stdout || "") + (err.stderr || ""));
      throw new Error("vitest run reported failures - see output above");
    }
  });

  await check("L", "npm run test:integration (DB-backed, local wazap_dev only)", async () => {
    const dbUrl = process.env.DATABASE_URL || "";
    if (!/localhost|127\.0\.0\.1/.test(dbUrl)) {
      skip("L", "npm run test:integration", `DATABASE_URL does not look local (${dbUrl.replace(/:[^:@]*@/, ":***@")}) - skipped for safety`);
      return;
    }
    const { execSync } = await import("node:child_process");
    try {
      const out = execSync("npx vitest run --config vitest.integration.config.ts", { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" });
      console.log(out.split("\n").slice(-15).join("\n"));
    } catch (err: any) {
      console.log((err.stdout || "") + (err.stderr || ""));
      throw new Error("integration tests reported failures - see output above");
    }
  });

  // -------------------------------------------------------------------------
  // Billing: graceful failure for a free user with no local payment keys
  // -------------------------------------------------------------------------
  await check("misc", "billing pages load and payment-create endpoints fail gracefully for a free user", async () => {
    const freeJar = planJars.get("free")!;
    await sleep(500);
    const billingPage = await http(freeJar, "/billing");
    assertEqual(billingPage.status, 200, "GET /billing");
    // UX-1 step 5: /plans is now a redirect to /billing#plans, not a page of its own.
    const plansPage = await http(freeJar, "/plans");
    assertTrue(plansPage.status === 307 || plansPage.status === 308, `GET /plans should redirect, got ${plansPage.status}`);
    assertTrue((plansPage.location || "").includes("/billing"), `GET /plans -> Location "${plansPage.location}" should include "/billing"`);
    const dodoResult = await http(freeJar, "/api/payment/dodo/create", {
      method: "POST",
      headers: await getOrigin(freeJar),
      body: JSON.stringify({ plan: "basic" }),
    });
    assertTrue(dodoResult.status >= 400 && dodoResult.status < 600, `dodo create should fail gracefully, got ${dodoResult.status}`);
    assertTrue(typeof dodoResult.body === "object" && dodoResult.body?.error, "dodo create should return a JSON error, not crash");
    const paypalResult = await http(freeJar, "/api/payment/paypal/create", {
      method: "POST",
      headers: await getOrigin(freeJar),
      body: JSON.stringify({ plan: "basic" }),
    });
    const paypalOk =
      (paypalResult.status >= 400 && paypalResult.status < 600 && paypalResult.body?.error) ||
      (paypalResult.status === 200 && paypalResult.body?.manual === true);
    assertTrue(paypalOk, `paypal create should fail gracefully or offer manual invoice, got ${paypalResult.status}: ${JSON.stringify(paypalResult.body)}`);
  });
}

// ===========================================================================
// Runner
// ===========================================================================
(async () => {
  let mainError: unknown = null;
  try {
    await main();
  } catch (err) {
    mainError = err;
    console.error("Fatal error in main():", err);
  } finally {
    console.log("\nCleaning up e2e data...");
    try {
      await cleanupAll();
    } catch (err) {
      console.error("Cleanup error:", err);
    }
    const remaining = await prisma.user.count({ where: { email: { startsWith: "e2e-" } } });
    console.log(`e2e users remaining after cleanup: ${remaining}`);

    console.log("\n=== RESULTS ===");
    const bySection = new Map<string, Result[]>();
    for (const r of results) bySection.set(r.section, [...(bySection.get(r.section) || []), r]);
    let pass = 0, fail = 0, skipped = 0;
    for (const [section, rows] of bySection) {
      console.log(`\n-- ${section} --`);
      for (const r of rows) {
        const mark = r.status === "PASS" ? "PASS" : r.status === "FAIL" ? "FAIL" : "SKIP";
        console.log(`[${mark}] ${r.name}${r.detail ? ` :: ${r.detail}` : ""}`);
        if (r.status === "PASS") pass++;
        else if (r.status === "FAIL") fail++;
        else skipped++;
      }
    }
    console.log(`\nTOTAL: ${pass} passed, ${fail} failed, ${skipped} skipped (of ${results.length})`);
    await prisma.$disconnect();
    if (mainError || fail > 0) process.exitCode = 1;
  }
})();
