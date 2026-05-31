import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // When running from repo root, package tests live under `packages/**`.
    // When running vitest from a workspace directory, tests resolve relative
    // to that workspace CWD (so include `src/__tests__` too).
    include: ["packages/**/__tests__/**/*.test.ts", "src/__tests__/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
