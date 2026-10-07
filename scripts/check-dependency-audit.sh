#!/usr/bin/env bash
set -euo pipefail

audit_file="$(mktemp /tmp/wazap-npm-audit.XXXXXX.json)"
cleanup() {
  rm -f "$audit_file"
}
trap cleanup EXIT

# npm exits non-zero when advisories meet its default threshold. Parse the
# report ourselves so the release rule remains explicit and reviewable.
npm audit --json > "$audit_file" || true

node - "$audit_file" <<'NODE'
const fs = require("fs");
const reportPath = process.argv[2];
let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
} catch {
  console.error("Dependency audit did not return a valid JSON report.");
  process.exit(1);
}

const counts = report?.metadata?.vulnerabilities;
if (!counts || !Number.isInteger(counts.high) || !Number.isInteger(counts.critical)) {
  console.error("Dependency audit report is missing vulnerability totals.");
  process.exit(1);
}

console.log(`Dependency audit: ${counts.total} total, ${counts.high} high, ${counts.critical} critical.`);
if (counts.high > 0 || counts.critical > 0) {
  console.error("Release blocked: high or critical dependency vulnerabilities are present.");
  process.exit(1);
}
NODE
