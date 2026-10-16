import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sanitizeAccountExport } from "../lib/account-export-sanitize.ts";

const marker = "do-not-export-this-value";
const sample = {
  password: marker,
  accessToken: marker,
  signingSecretEncrypted: marker,
  webhookPathToken: marker,
  keyHash: marker,
  secretPrefix: "wz_visible_prefix",
  inputTokens: 42,
  config: { api_key: marker, nested: { authorization: marker, safe: "kept" } },
  url: `https://user:${marker}@example.com/hook?token=${marker}&view=full`,
  createdAt: new Date("2026-08-03T00:00:00.000Z"),
};
const sanitized = sanitizeAccountExport(sample);
const serialized = JSON.stringify(sanitized);
assert(!serialized.includes(marker), "Secret marker leaked through export sanitizer");
assert.equal(sanitized.secretPrefix, "wz_visible_prefix");
assert.equal(sanitized.inputTokens, 42, "Non-secret token usage metrics were removed");
assert.equal(sanitized.config.nested.safe, "kept");
assert.match(sanitized.url, /token=%5Bredacted%5D/);
assert(!sanitized.url.includes("user:"), "URL userinfo was not removed");
assert(sanitized.createdAt instanceof Date, "Date values must remain serializable as ISO timestamps");

const source = await readFile(new URL("../lib/account-lifecycle.ts", import.meta.url), "utf8");
for (const required of [
  "inboxTasks", "inboxEvents", "aiRuns", "aiEvaluations", "apiRequestLogs",
  "apiIdempotencyRecords", "deliveryAttempts", "marketplacePublisher",
  "marketplaceInstalls", "partnerAttributions", "marketplaceAbuseReports",
  "funnelEvents", "siteVisits", "operationalIncidents", "referralTouches",
  "chatsStarted", "olderFeatures", "omitEmptyExportKeys",
]) assert(source.includes(required), `Account export coverage is missing ${required}`);
assert(source.includes('ACCOUNT_EXPORT_FORMAT_VERSION = "2026-10-16"'), "Export contract version was not advanced");

console.log(JSON.stringify({ ok: true, secretLeak: false, coverageGroups: 18, exportVersion: "2026-10-16" }));
