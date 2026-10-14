import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // DB-backed billing integration tests live under tests/integration and
    // run only via `npm run test:integration` (vitest.integration.config.ts)
    // - `npm test` must stay fast and DB-free.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/integration/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
