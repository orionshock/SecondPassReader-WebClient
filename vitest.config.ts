import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // When running from repo root, package tests live under `packages/**`.
    // When running vitest from a workspace directory, tests resolve relative
    // to that workspace CWD (so include `src/__tests__` too).
    include: ["packages/**/__tests__/**/*.test.{ts,tsx}", "src/__tests__/**/*.test.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "src/**/*.{ts,tsx}",
        "packages/secondpass-client/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/*.Types.ts",
        "**/*.Fixtures.ts",
        "src/main.tsx",
        "packages/secondpass-client/src/index.ts",
      ],
    },
  },
});
