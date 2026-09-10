import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // RLS tests round-trip to a real Postgres.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
