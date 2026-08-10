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
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      reportsDirectory: "coverage",
      include: [
        "packages/secondpass-client/src/**/*.ts",
        "src/app/navigation.ts",
        "src/features/connection/accountProfile.ts",
        "src/features/connection/defaultDeviceName.ts",
        "src/features/reader/annotations/annotationColors.ts",
        "src/features/reader/annotations/annotationSelectors.ts",
        "src/features/reader/annotations/annotationUtils.ts",
        "src/features/reader/annotations/bookmarkLabels.ts",
        "src/features/reader/annotations/bookmarkUtils.ts",
        "src/features/reader/selection/quoteContext.ts",
        "src/features/reader/session/previousSession/PreviousSessionAnnotationItems.Presenter.ts",
        "src/features/reader/session/previousSession/PreviousSessionViewModels.Presenter.ts",
        "src/features/reader/session/readerCfiDescriptions.ts",
        "src/features/reader/session/readerSessionLabels.ts",
        "src/features/sessions/sessionDetailDisplay.ts",
        "src/features/shelves/shelfMeta.tsx",
        "src/storage/marginaliaLayerPreferences.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/**/*.d.ts",
        "src/**/types.ts",
        "src/**/readerActivityTypes.ts",
        "packages/**/__tests__/**",
        "packages/secondpass-client/src/**/*.d.ts",
        "packages/secondpass-client/src/index.ts",
      ],
    },
  },
});
