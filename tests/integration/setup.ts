// Loads .env for the integration tests (DATABASE_URL etc). dotenv is not a
// project dependency, so this parses the file minimally instead of adding
// one just for tests.
import fs from "node:fs";
import path from "node:path";
import { afterEach, vi } from "vitest";

function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(path.resolve(__dirname, "../../.env"));

// Safety: these tests must never run against anything that looks like a
// production database.
const dbUrl = process.env.DATABASE_URL || "";
if (!/localhost|127\.0\.0\.1/.test(dbUrl)) {
  throw new Error(
    `Refusing to run billing integration tests: DATABASE_URL does not look like a local database (${dbUrl.replace(/:[^:@]*@/, ":***@")}).`,
  );
}

// Vitest already sets NODE_ENV=test; nothing to do here.
// Provider helpers are mocked in the test files themselves; these only need
// to exist so getPayPalPlanId()/dodoProductForPlan() (kept real) resolve.
process.env.PAYPAL_PLAN_ID_BASIC = process.env.PAYPAL_PLAN_ID_BASIC || "P-LOCAL-QA-BASIC";
process.env.PAYPAL_PLAN_ID_PRO = process.env.PAYPAL_PLAN_ID_PRO || "P-LOCAL-QA-PRO";
process.env.PAYPAL_PLAN_ID_ULTIMATE = process.env.PAYPAL_PLAN_ID_ULTIMATE || "P-LOCAL-QA-ULTIMATE";
process.env.DODO_PRODUCT_ID_BASIC = process.env.DODO_PRODUCT_ID_BASIC || "prod_local_qa_basic";
process.env.DODO_PRODUCT_ID_PRO = process.env.DODO_PRODUCT_ID_PRO || "prod_local_qa_pro";
process.env.DODO_PRODUCT_ID_ULTIMATE = process.env.DODO_PRODUCT_ID_ULTIMATE || "prod_local_qa_ultimate";

// Billing feature flags default OFF; each test turns on what it needs and
// restores afterwards (see tests/integration/helpers.ts withEnv()).
delete process.env.BILLING_PLAN_CHANGES_ENABLED;
delete process.env.BILLING_AUTO_REFUND_DUPLICATES;
delete process.env.PLAN_LIMIT_PAUSING_ENABLED;

// Every test file mocks @/lib/paypal and @/lib/dodo with vi.fn()s; reset call
// counts (not implementations) between tests so assertions like
// "called exactly once" never see another test's calls.
afterEach(() => {
  vi.clearAllMocks();
});
