import { defineConfig } from "vitest/config";
import path from "path";

// Separate config for DB-backed integration tests (billing state machine).
// `npm test` (vitest.config.ts) only picks up lib/__tests__/**, stays DB-free
// and fast. This config only picks up tests/integration/** and always runs
// them sequentially in a single fork - these tests share one Postgres
// database (wazap_dev) and take out per-user advisory locks, but two
// *different* test files running in parallel workers would still race on
// shared tables (SecurityBillingEvent, BillingAttention, etc).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
