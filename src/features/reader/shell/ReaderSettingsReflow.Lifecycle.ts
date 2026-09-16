import { useEffect, useRef } from "react";
import type { ReaderSettings } from "../../../storage/ReaderSettings.Store";
import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";
import type { ReaderOperationFailureKind } from "./ReaderOperationError.Policy";
import { isReaderFullyReady, type ReaderReadinessState } from "./ReaderReadiness.State";
import type { ReaderRuntimeController } from "./ReaderRuntime.Controller";

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
  runtimeController: ReaderRuntimeController;
  reportOperationError: ReportReaderOperationError;
}): void {
  const {
    engineGenerationRef,
    engineRef,
    readiness,
    reportOperationError,
    runtimeController,
    settings,
  } = input;
  const lastHandledRendererSettingsRef = useRef<ReaderSettings | null>(settings ?? null);
  const lastHandledReaderWidthRef = useRef<ReaderSettings["readerWidth"] | null>(
    settings?.readerWidth ?? null,
  );

  useEffect(() => {
    if (!settings) return;
    if (!isReaderFullyReady(readiness)) return;
    if (!engineRef.current) return;
    const previous = lastHandledRendererSettingsRef.current;
    lastHandledRendererSettingsRef.current = settings;
    if (!previous) return;
    if (sameRendererSettings(previous, settings)) return;

    const generation = engineGenerationRef.current;

    void (async () => {
      try {
        await runtimeController.reflow({
          type: "apply-settings",
          settings,
        });
      } catch (error) {
        reportOperationError(error, "Display settings failed.", generation, "reflow");
      }
    })();
  }, [
    readiness,
    reportOperationError,
    runtimeController,
    settings,
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
        await runtimeController.reflow({
          type: "resize-to-mount",
          timing: "after-layout",
          isRequested: () => !cancelled,
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
    readiness,
    reportOperationError,
    runtimeController,
    settings?.readerWidth,
  ]);
}

function sameRendererSettings(left: ReaderSettings, right: ReaderSettings): boolean {
  return left.theme === right.theme
    && left.fontFamily === right.fontFamily
    && left.fontSizePercent === right.fontSizePercent
    && left.lineHeight === right.lineHeight;
}
