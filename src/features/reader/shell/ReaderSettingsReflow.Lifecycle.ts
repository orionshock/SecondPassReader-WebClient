import { useEffect, useRef } from "react";
import type { ReaderSettings } from "../../../storage/readerSettings";
import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";
import type { ReaderBootstrapProgressGuard } from "./ReaderBootstrapProgressGuard.State";
import type { ReaderOperationFailureKind } from "./ReaderOperationError.Policy";
import { isReaderFullyReady, type ReaderReadinessState } from "./ReaderReadiness.State";
import type { ReaderRuntimeController } from "./ReaderRuntime.Controller";
import type { StagedSelectionLifecycle } from "./StagedSelection.Lifecycle";

type MutableRef<T> = { current: T };

type ReportReaderOperationError = (
  error: unknown,
  fallback: string,
  generation: number,
  kind: ReaderOperationFailureKind,
) => void;

export function useReaderSettingsReflowLifecycle(input: {
  settings?: ReaderSettings;
  readiness: ReaderReadinessState;
  engineRef: MutableRef<EpubTsBookEngine | null>;
  engineGenerationRef: MutableRef<number>;
  reanchorStagedToolbarRef: MutableRef<() => Promise<void>>;
  bootstrapProgressGuard: ReaderBootstrapProgressGuard;
  runtimeController: ReaderRuntimeController;
  stagedSelectionLifecycle: StagedSelectionLifecycle;
  reportOperationError: ReportReaderOperationError;
  waitForLayout: () => Promise<void>;
}): void {
  const {
    bootstrapProgressGuard,
    engineGenerationRef,
    engineRef,
    readiness,
    reanchorStagedToolbarRef,
    reportOperationError,
    runtimeController,
    settings,
    stagedSelectionLifecycle,
    waitForLayout,
  } = input;
  const lastHandledReaderWidthRef = useRef<ReaderSettings["readerWidth"] | null>(
    settings?.readerWidth ?? null,
  );

  useEffect(() => {
    if (!settings) return;
    if (!isReaderFullyReady(readiness)) return;
    if (!engineRef.current) return;
    const generation = engineGenerationRef.current;

    void (async () => {
      try {
        await runtimeController.stabilizeReflow("settings", {
          reflow: (activeEngine) => stagedSelectionLifecycle.runNavigation(
            "layout-reflow",
            () => activeEngine.applyDisplaySettings(settings, {
              preserveCfi: bootstrapProgressGuard.getProtectedRestoreCfi(generation),
            }),
          ),
          refreshMarks: (activeEngine) => activeEngine.refreshHighlightMarks(),
          reanchorStagedToolbar: () => reanchorStagedToolbarRef.current(),
        });
      } catch (error) {
        reportOperationError(error, "Display settings failed.", generation, "reflow");
      }
    })();
  }, [
    bootstrapProgressGuard,
    readiness,
    reportOperationError,
    runtimeController,
    settings,
    stagedSelectionLifecycle,
  ]);

  useEffect(() => {
    const readerWidth = settings?.readerWidth;
    if (!readerWidth) return;
    if (!isReaderFullyReady(readiness)) return;
    if (lastHandledReaderWidthRef.current === readerWidth) return;
    lastHandledReaderWidthRef.current = readerWidth;

    if (!engineRef.current) return;
    let cancelled = false;
    const generation = engineGenerationRef.current;

    void (async () => {
      try {
        await runtimeController.stabilizeReflow("resize", {
          reflow: async (activeEngine) => {
            await stagedSelectionLifecycle.runNavigation("layout-reflow", async () => {
              await waitForLayout();
              if (cancelled) return;
              await activeEngine.resizeToMount({
                preserveCfi: bootstrapProgressGuard.getProtectedRestoreCfi(generation),
              });
            });
          },
          refreshMarks: (activeEngine) => {
            if (!cancelled) activeEngine.refreshHighlightMarks();
          },
          reanchorStagedToolbar: () => cancelled
            ? Promise.resolve()
            : reanchorStagedToolbarRef.current(),
        });
      } catch (error) {
        if (cancelled) return;
        reportOperationError(error, "Reader resize failed.", generation, "reflow");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapProgressGuard,
    readiness,
    reportOperationError,
    runtimeController,
    settings?.readerWidth,
    stagedSelectionLifecycle,
    waitForLayout,
  ]);
}
