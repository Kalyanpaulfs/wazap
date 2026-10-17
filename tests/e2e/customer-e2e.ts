// Full customer-journey end-to-end check against the LOCAL dev server
// (http://localhost:3000), acting like a real browser over HTTP (fetch +
// manual cookie jar for the NextAuth email-code flow), with direct Prisma
// used only for test setup/verification/cleanup - exactly like
// scripts/support-flow-check.ts does for the support flow.
//
// Usage: npx tsx tests/e2e/customer-e2e.ts
//
// Everything this script creates uses emails e2e-<runId>-<label>@wazap-qa.test
// and is deleted again in the `finally` block at the end, pass or fail.
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspaces";

const cleanHtml = (s: string) => s.replace(/<!--.*?-->/g, "");

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const DEV_LOG =
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
function trackEmail(email: string) {
  createdEmails.add(email);
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
  await prisma.crmActivity.deleteMany({ where: { lead: { email: { in: [...createdEmails] } } } }).catch(() => {});
  await prisma.crmLead.deleteMany({ where: { email: { in: [...createdEmails] } } }).catch(() => {});
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

  const PRIVATE_PAGES = ["/dashboard", "/performance", "/reports", "/plans", "/billing", "/account"];
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
  const PLAN_LOGGED_IN_PAGES = [
    "/dashboard", "/tools/rotator", "/tools/shortlink", "/tools/ad-builder", "/tools/widget",
    "/qr", "/performance", "/reports", "/plans", "/billing", "/account", "/support",
  ];

  type PlanCfg = { key: "free" | "basic" | "pro" | "ultimate"; rotatorLimit: number; numbersLimit: number; shortLimit: number; adLimit: number; widget: boolean };
  const PLANS: PlanCfg[] = [
    // Free-trial restructure: "free" (no paid plan, no active trial) is 0 of
    // everything - nothing is grandfathered any more.
    { key: "free", rotatorLimit: 0, numbersLimit: 0, shortLimit: 0, adLimit: 0, widget: false },
    { key: "basic", rotatorLimit: 3, numbersLimit: 3, shortLimit: 2, adLimit: 0, widget: true },
    { key: "pro", rotatorLimit: 10, numbersLimit: 10, shortLimit: 5, adLimit: 5, widget: true },
    { key: "ultimate", rotatorLimit: 25, numbersLimit: 20, shortLimit: 15, adLimit: 15, widget: true },
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

    // --- D. Rotator count limit ---
    await check("D", `${plan.key}: rotator count limit is ${plan.rotatorLimit}`, async () => {
      // Pre-fill to the limit directly (setup), then confirm the API itself
      // refuses one more - exercising the real count>=limit check.
      for (let i = 0; i < plan.rotatorLimit; i++) {
        await prisma.rotatorLink.create({
          data: { userId: user.id, code: `E2ER${RUN}${plan.key}${i}`, name: `prefill ${i}`, numbers: ["919800000001"], fallbackNumber: "919800000001" },
        });
      }
      const r = await http(jar, "/api/rotator", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "one too many", numbers: ["919800000099"] }),
      });
      if (plan.rotatorLimit === 0) {
        assertEqual(r.status, 403, "rotator creation on a 0-limit plan");
      } else {
        assertEqual(r.status, 403, `creating rotator #${plan.rotatorLimit + 1} should be refused`);
        assertTrue(r.body?.upgrade === true, "refusal should carry upgrade:true");
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
      // May itself be refused by the count limit (already at/over it from the
      // previous check) - that's fine, we only care about the numbers-limit
      // branch when the count limit doesn't get in the way first.
      if (okResult.status === 403 && okResult.body?.error && /plan allows .* rotator/i.test(okResult.body.error)) {
        // count limit reached first; still verify the too-many-numbers case alone
      } else {
        assertEqual(okResult.status, 200, `rotator with exactly ${plan.numbersLimit} numbers should be accepted`);
      }
      const tooManyResult = await http(jar, "/api/rotator", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "numbers too many", numbers: tooMany }),
      });
      assertEqual(tooManyResult.status, 403, `rotator with ${plan.numbersLimit + 1} numbers should be refused`);
    });

    // --- D. Short link limit ---
    await check("D", `${plan.key}: short link limit is ${plan.shortLimit}`, async () => {
      for (let i = 0; i < plan.shortLimit; i++) {
        await prisma.shortLink.create({ data: { userId: user.id, code: `e2esl${RUN}${plan.key}${i}`, name: `sl${i}`, phone: "919800000001" } });
      }
      const r = await http(jar, "/api/shortlinks", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "one too many", phone: "919800000099" }),
      });
      assertEqual(r.status, 403, `short link #${plan.shortLimit + 1} should be refused`);
    });

    // --- D. Ad link limit ---
    await check("D", `${plan.key}: ad link limit is ${plan.adLimit}`, async () => {
      for (let i = 0; i < plan.adLimit; i++) {
        await prisma.adLink.create({ data: { userId: user.id, name: `ad${i}`, number: "919800000001" } });
      }
      const r = await http(jar, "/api/adlinks", {
        method: "POST",
        headers: await getOrigin(jar),
        body: JSON.stringify({ name: "one too many", number: "919800000099" }),
      });
      assertEqual(r.status, 403, `ad link #${plan.adLimit + 1} should be refused`);
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
  // G. Reports
  // -------------------------------------------------------------------------
  await check("G", "free: reports page shows the locked/upgrade state", async () => {
    const freeJar = planJars.get("free");
    const r = await http(freeJar!, "/reports");
    assertEqual(r.status, 200, "GET /reports as free");
    assertTrue(r.text.includes("Your free trial has ended"), "free/no-trial user should see the locked reports teaser");
  });

  await check("G", "solo: 'Basic reports' badge, no date picker", async () => {
    const basicJar = planJars.get("basic");
    const r = await http(basicJar!, "/reports");
    assertEqual(r.status, 200, "GET /reports as basic");
    assertTrue(cleanHtml(r.text).includes("Basic reports"), "basic user should see the 'Basic reports' badge");
    assertTrue(!r.text.includes('type="date"'), "basic user should not see a custom date picker");
  });

  await check("G", "growth: 'Full reports', custom from/to works", async () => {
    const proJar = planJars.get("pro");
    const r = await http(proJar!, "/reports");
    assertEqual(r.status, 200, "GET /reports as pro");
    assertTrue(cleanHtml(r.text).includes("Full reports"), "pro user should see the 'Full reports' badge");
    assertTrue(r.text.includes('type="date"'), "pro user should see a custom date picker");
    const customResult = await http(proJar!, "/reports?from=2026-10-01&to=2026-10-16");
    assertEqual(customResult.status, 200, "custom from/to range should load for a Growth user");
    assertTrue(customResult.text.includes("2026-10-01"), "custom range should echo the chosen from date");
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
    const proResult = await http(planJars.get("pro")!, "/api/reports/export?from=2026-10-01&to=2026-10-17");
    assertEqual(proResult.status, 200, "CSV export should work for growth with from/to");
    assertTrue(proResult.text.toLowerCase().includes("salesperson"), "CSV header should include the salesperson column");
    assertTrue(proResult.text.includes("Priya"), "CSV should include the salesperson's name for the routed chat");
  });

  // -------------------------------------------------------------------------
  // H. Performance
  // -------------------------------------------------------------------------
  await check("H", "free (no-trial) user: performance page shows the paused/choose-a-plan banner", async () => {
    const r = await http(planJars.get("free")!, "/performance");
    assertEqual(r.status, 200, "GET /performance as free");
    assertTrue(/free trial has ended/i.test(cleanHtml(r.text)), "free/no-trial user should see the trial-ended paused banner");
  });

  await check("H", "trial user: performance page shows 'Free trial · N days left · X of 100 trial leads used'", async () => {
    const trialJar = await loggedInJar(emailFor("trial-cap"));
    const r = await http(trialJar, "/performance");
    assertEqual(r.status, 200, "GET /performance as trial user");
    assertTrue(/free trial.*\d+ of 100 trial leads used/i.test(cleanHtml(r.text)), "trial user should see the trial leads-used meter");
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
      const endingSoon = await createDbUser("trial-ending-soon", {
        plan: "free",
        trialPlan: "basic",
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 2 * 86_400_000),
      });
      const justExpired = await createDbUser("trial-just-expired", {
        plan: "free",
        trialPlan: "basic",
        trialStartedAt: new Date(Date.now() - 3 * 86_400_000),
        trialEndsAt: new Date(Date.now() - 60_000),
      });
      const r = await http(null, "/api/cron/trial-lifecycle", { headers: { Authorization: `Bearer ${cronSecret}` } });
      assertEqual(r.status, 200, `cron call: ${JSON.stringify(r.body)}`);
      const reminderEmail = await prisma.outboundEmail.findFirst({ where: { userId: endingSoon.id, type: "trial_ending" } });
      assertTrue(!!reminderEmail, "a trial_ending reminder email should be queued");
      const refreshed = await prisma.user.findUnique({ where: { id: endingSoon.id } });
      assertTrue(!!refreshed!.trialReminderSentAt, "trialReminderSentAt should be set");
      const expiredEvent = await prisma.funnelEvent.findFirst({ where: { userId: justExpired.id, name: "trial_expired" } });
      assertTrue(!!expiredEvent, "a trial_expired funnel event should be recorded");
    });

    await check("J", "expire-plans: pauses ALL rotators once the Free trial ends (Free-trial restructure: free is 0 of everything)", async () => {
      // The cron's free/no-trial sweep no longer depends on isNewStyleTrial
      // or a lookback window - it matches ANY plan:"free" user who still has
      // an un-paused link, however long ago their trial ended.
      const trialEndedUser = await createDbUser("trial-ended-pause", {
        plan: "free",
        trialPlan: "basic", // Solo-level link limits (rotatorLimit 3) while the trial ran
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
  // K. Support flow check (existing script)
  // -------------------------------------------------------------------------
  await check("K", "scripts/support-flow-check.ts passes", async () => {
    const { execSync } = await import("node:child_process");
    const out = execSync("npx tsx scripts/support-flow-check.ts", { cwd: process.cwd(), encoding: "utf8" });
    const jsonMatch = out.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    assertTrue(parsed.passed > 0 && Array.isArray(parsed.checks), `unexpected output: ${out}`);
    console.log(`  support-flow-check: ${parsed.passed} checks passed`);
  });

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
    const plansPage = await http(freeJar, "/plans");
    assertEqual(plansPage.status, 200, "GET /plans");
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
