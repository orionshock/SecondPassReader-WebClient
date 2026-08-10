import { useEffect } from "react";
import type { ReaderSettings } from "../../../storage/readerSettings";
import type {
  ReaderDescribeCfiHandle,
  ReaderDisplayCfiHandle,
  ReaderProbeCfiHandle,
  ReaderSearchBookHandle,
} from "../domain/ReaderBridge.Types";
import type { ReaderHighlightMark, ReaderLocationTarget, ReaderSelection } from "../domain/ReaderDomain.Types";
import {
  createEpubTsBookEngine,
  type EpubTsBookEngine,
  type EpubTsBookEngineInit,
} from "../engine/EpubTsBook.Engine";
import type { ReadingShellEvent } from "./ReaderShell.Types";
import type { ReaderBootstrapProgressGuard } from "./ReaderBootstrapProgressGuard.State";
import { ReaderCapabilityPublicationLifecycle } from "./ReaderCapabilityPublication.Lifecycle";
import { publishReaderLocation } from "./ReaderLocationPublication.Lifecycle";
import type { ReaderOperationFailureKind } from "./ReaderOperationError.Policy";
import type { ReaderReadinessState } from "./ReaderReadiness.State";
import type { ReaderRuntimeController } from "./ReaderRuntime.Controller";
import type { StagedSelectionLifecycle } from "./StagedSelection.Lifecycle";

type MutableRef<T> = { current: T };

export function useReaderEngineBootstrapLifecycle(input: {
  blob: Blob;
  mountEl: HTMLDivElement | null;
  engineRef: MutableRef<EpubTsBookEngine | null>;
  engineGenerationRef: MutableRef<number>;
  hasReadableViewportRef: MutableRef<boolean>;
  initialDisplayTargetRef: MutableRef<ReaderLocationTarget | undefined>;
  settingsRef: MutableRef<ReaderSettings | undefined>;
  highlightMarksRef: MutableRef<ReaderHighlightMark[]>;
  onEventRef: MutableRef<((event: ReadingShellEvent) => void) | undefined>;
  reanchorStagedToolbarRef: MutableRef<() => Promise<void>>;
  bootstrapProgressGuard: ReaderBootstrapProgressGuard;
  runtimeController: ReaderRuntimeController;
  stagedSelectionLifecycle: StagedSelectionLifecycle;
  onEngineSelectionChanged: (selection: ReaderSelection | null) => void;
  onEngineHighlightClick: NonNullable<EpubTsBookEngineInit["onHighlightClick"]>;
  closeDurableToolbar: () => void;
  recordReadableViewport: (generation: number) => void;
  markReadableViewport: (generation: number) => void;
  setReadiness: (state: ReaderReadinessState) => void;
  setErrorMessage: (message: string | null) => void;
  reportOperationError: (
    error: unknown,
    fallback: string,
    generation: number,
    kind: ReaderOperationFailureKind,
  ) => void;
  clearDeferredCommand: () => void;
  flushDeferredCommand: (generation: number) => Promise<void>;
  onDescribeCfiReady?: (handle: ReaderDescribeCfiHandle | null) => void;
  onProbeCfiReady?: (handle: ReaderProbeCfiHandle | null) => void;
  onDisplayCfiReady?: (handle: ReaderDisplayCfiHandle | null) => void;
  onSearchReady?: (handle: ReaderSearchBookHandle | null) => void;
}): void {
  const {
    blob,
    bootstrapProgressGuard,
    clearDeferredCommand,
    closeDurableToolbar,
    engineGenerationRef,
    engineRef,
    hasReadableViewportRef,
    highlightMarksRef,
    initialDisplayTargetRef,
    markReadableViewport,
    mountEl,
    onDescribeCfiReady,
    onDisplayCfiReady,
    onEngineHighlightClick,
    onEngineSelectionChanged,
    onEventRef,
    onProbeCfiReady,
    onSearchReady,
    reanchorStagedToolbarRef,
    recordReadableViewport,
    reportOperationError,
    runtimeController,
    setErrorMessage,
    setReadiness,
    settingsRef,
    stagedSelectionLifecycle,
    flushDeferredCommand,
  } = input;

  useEffect(() => {
    if (!mountEl) return;

    let cancelled = false;
    setReadiness("loading-engine");
    setErrorMessage(null);
    hasReadableViewportRef.current = false;
    engineGenerationRef.current += 1;
    const generation = engineGenerationRef.current;
    const initialTarget = initialDisplayTargetRef.current;
    bootstrapProgressGuard.reset(
      generation,
      initialTarget?.type === "cfi" ? initialTarget.cfi : null,
    );
    const capabilityPublication = new ReaderCapabilityPublicationLifecycle({
      bootstrapProgressGuard,
      runtimeController,
      stagedSelectionLifecycle,
      onDescribeCfiReady,
      onProbeCfiReady,
      onDisplayCfiReady,
      onSearchReady,
    });

    void (async () => {
      try {
        const engine = await createEpubTsBookEngine({
          source: blob,
          mountEl,
          // Locations generation currently can throw unhandled errors in epub-ts for some books.
          // Keep it opt-in until upstream behavior is reliable.
          enableLocationsGeneration: true,
          displaySettings: settingsRef.current,
          onLocationChanged: (location) => publishReaderLocation({
            location,
            generation,
            bootstrapProgressGuard,
            stagedSelectionLifecycle,
            recordReadableViewport,
            closeDurableToolbar,
            publishEvent: (event) => onEventRef.current?.(event),
            reanchorStagedToolbar: () => reanchorStagedToolbarRef.current(),
          }),
          onTocReady: (toc) => onEventRef.current?.({ type: "tocReady", toc }),
          onLocationsReady: () => onEventRef.current?.({ type: "locationsReady" }),
          onSelectionChanged: onEngineSelectionChanged,
          onHighlightClick: onEngineHighlightClick,
          onError: (error) => onEventRef.current?.({ type: "displayError", error }),
        });

        if (cancelled) {
          engine.destroy();
          return;
        }

        engineRef.current = engine;
        runtimeController.attach(engine, generation);
        setReadiness("engine-attached");

        // Durable marks may arrive before engine attachment; bootstrap applies the latest snapshot.
        engine.setHighlightMarks(highlightMarksRef.current);

        let initialDisplaySucceeded = false;
        try {
          await runtimeController.run({
            kind: "initial-display",
            run: ({ engine: activeEngine }) => activeEngine.display(initialDisplayTargetRef.current),
          });
          initialDisplaySucceeded = true;
        } catch (error) {
          reportOperationError(error, "Display failed.", generation, "display");
        }

        if (initialDisplaySucceeded || hasReadableViewportRef.current) {
          markReadableViewport(generation);
        }
        if (!hasReadableViewportRef.current) return;

        capabilityPublication.publish(
          engine,
          generation,
          () => engineRef.current === engine && engineGenerationRef.current === generation,
        );
        await flushDeferredCommand(generation);
      } catch (error) {
        if (cancelled) return;
        reportOperationError(error, "Failed to initialize epub-ts engine.", generation, "initialization");
      }
    })();

    return () => {
      cancelled = true;
      engineGenerationRef.current += 1;
      clearDeferredCommand();
      const engine = engineRef.current;
      engineRef.current = null;
      runtimeController.detach(generation);
      capabilityPublication.unpublish();
      engine?.destroy();
    };
  }, [
    blob,
    bootstrapProgressGuard,
    clearDeferredCommand,
    closeDurableToolbar,
    markReadableViewport,
    mountEl,
    onDescribeCfiReady,
    onDisplayCfiReady,
    onEngineHighlightClick,
    onEngineSelectionChanged,
    onProbeCfiReady,
    onSearchReady,
    recordReadableViewport,
    reportOperationError,
    runtimeController,
    stagedSelectionLifecycle,
    flushDeferredCommand,
  ]);
}
