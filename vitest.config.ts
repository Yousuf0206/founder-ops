import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Vitest has no client bundle, so the real `server-only` package cannot
      // resolve. The stub lets server modules be unit-tested; `next build`
      // still enforces the real guard.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // RLS tests round-trip to a real Postgres.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
