import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";
import { ReaderViewport } from "./ReaderViewport.UI";
import type { ReaderSettings } from "../../../storage/ReaderSettings.Store";
import type { ReaderHighlightMark, ReaderLocationTarget, ReaderTocItem } from "../domain/ReaderDomain.Types";
import type {
  ReadingShellCommand,
  ReadingShellEvent,
} from "./ReaderShell.Types";
import type {
  ReaderRendererCapability,
  StagedSelectionCommitInput,
  StagedSelectionSource,
} from "../domain/ReaderBridge.Types";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import { ReaderDisplaySettingsMenu } from "../settings/ReaderDisplaySettingsMenu.UI";
import { SelectionHighlightToolbar } from "./ReaderSelectionHighlightToolbar.UI";
import { TableOfContentsDrawer } from "./ReaderTableOfContentsDrawer.UI";
import { DurableAnnotationToolbar } from "./ReaderDurableAnnotationToolbar.UI";
import type { DurableAnnotationToolbarItem } from "./ReaderDurableAnnotationToolbar.Types";
import { ReaderRuntimeController } from "./ReaderRuntime.Controller";
import { observeReaderMountResize } from "./ReaderMountResize.Lifecycle";
import {
  classifyReaderOperationError,
  type ReaderOperationFailureKind,
} from "./ReaderOperationError.Policy";
import {
  isReaderFullyReady,
  toReaderViewportStatus,
  type ReaderReadinessState,
} from "./ReaderReadiness.State";
import { ReaderBootstrapProgressGuard } from "./ReaderBootstrapProgressGuard.State";
import { useReaderEngineBootstrapLifecycle } from "./ReaderEngineBootstrap.Lifecycle";
import { useReaderCommandRoutingLifecycle } from "./ReaderCommandRouting.Lifecycle";
import { useReaderSettingsReflowLifecycle } from "./ReaderSettingsReflow.Lifecycle";
import { useReaderStagedToolbarController } from "./ReaderStagedToolbar.Controller";
import { useReaderDurableAnnotationToolbarController } from "./ReaderDurableAnnotationToolbar.Controller";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";

export type ReadingShellProps = {
  blob: Blob;
  initialDisplayTarget?: ReaderLocationTarget;
  onEvent?: (event: ReadingShellEvent) => void;
  toc?: ReaderTocItem[] | null;
  currentHref?: string | null;
  command?: ReadingShellCommand;
  highlightMarks?: ReaderHighlightMark[];
  temporarySearchHighlightCfi?: string | null;
  onCommitHighlight?: (input: StagedSelectionCommitInput) => Promise<void>;
  highlightCommitBusy?: boolean;
  onRendererCapabilityReady?: (capability: ReaderRendererCapability | null) => void;
  onStagedSelectionCommitted?: (source: StagedSelectionSource) => void;
  onStagedSelectionCanceled?: (source: StagedSelectionSource) => void;
  onUnrelatedNavigation?: () => void;
  annotationToolbarItems?: DurableAnnotationToolbarItem[];
  onUpdateHighlight?: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
  onRemoveAnnotation?: (annotationId: string) => Promise<void>;
  onOpenAnnotationInWorkspace?: (annotationId: string, mode: "editable" | "readonly") => void;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onSettingsReset?: () => void;
};

// Owns one mounted renderer generation and its transient interaction state.
// Session authority and connectivity changes stay above this boundary.
export function ReadingShell(props: ReadingShellProps) {
  const engineRef = useRef<EpubTsBookEngine | null>(null);
  const runtimeControllerRef = useRef<ReaderRuntimeController | null>(null);
  if (!runtimeControllerRef.current) runtimeControllerRef.current = new ReaderRuntimeController();
  const runtimeController = runtimeControllerRef.current;
  const mountWrapperRef = useRef<HTMLDivElement | null>(null);
  const engineGenerationRef = useRef(0);
  const hasReadableViewportRef = useRef(false);
  const bootstrapProgressGuardRef = useRef<ReaderBootstrapProgressGuard | null>(null);
  if (!bootstrapProgressGuardRef.current) {
    bootstrapProgressGuardRef.current = new ReaderBootstrapProgressGuard();
  }
  const bootstrapProgressGuard = bootstrapProgressGuardRef.current;
  const settingsRef = useRef<ReaderSettings | undefined>(props.settings);
  const initialDisplayTargetRef = useRef<ReaderLocationTarget | undefined>(props.initialDisplayTarget);
  const onEventRef = useRef<ReadingShellProps["onEvent"]>(props.onEvent);

  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const [readiness, setReadiness] = useState<ReaderReadinessState>("empty");
  const [engineCapability, setEngineCapability] = useState<Omit<ReaderRendererCapability, "stagedSelection"> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const highlightMarksRef = useRef<ReaderHighlightMark[]>(props.highlightMarks ?? []);
  useEffect(() => {
    settingsRef.current = props.settings;
  }, [props.settings]);

  useEffect(() => {
    onEventRef.current = props.onEvent;
  }, [props.onEvent]);

  useEffect(() => {
    initialDisplayTargetRef.current = props.initialDisplayTarget;
  }, [props.initialDisplayTarget]);

  useEffect(() => {
    highlightMarksRef.current = props.highlightMarks ?? [];
  }, [props.highlightMarks]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setTemporarySearchHighlight(props.temporarySearchHighlightCfi ?? null);
  }, [props.temporarySearchHighlightCfi]);

  const mountRef = useCallback((el: HTMLDivElement | null) => {
    setMountEl(el);
  }, []);

  const cancelStagedForDurableToolbarRef = useRef<() => void>(() => undefined);
  const cancelStagedForDurableToolbar = useCallback(() => {
    cancelStagedForDurableToolbarRef.current();
  }, []);
  const {
    closeToolbar: closeDurableToolbar,
    onEngineHighlightClick,
    toolbarProps: durableToolbarProps,
  } = useReaderDurableAnnotationToolbarController({
    items: props.annotationToolbarItems,
    busy: props.highlightCommitBusy,
    theme: props.settings?.theme,
    cancelStagedSelection: cancelStagedForDurableToolbar,
    onUpdateHighlight: props.onUpdateHighlight,
    onRemoveAnnotation: props.onRemoveAnnotation,
    onOpenAnnotationInWorkspace: props.onOpenAnnotationInWorkspace,
  });

  const {
    cancelStaged,
    onEngineSelectionChanged,
    reanchorStagedToolbarRef,
    stagedSelectionLifecycle: stagedLifecycle,
    stagedSelectionCapability,
    toolbarProps: stagedToolbarProps,
  } = useReaderStagedToolbarController({
    engineRef,
    mountWrapperRef,
    readiness,
    highlightMarks: props.highlightMarks,
    onCommitHighlight: props.onCommitHighlight,
    commitBusy: props.highlightCommitBusy,
    onStagedSelectionCommitted: props.onStagedSelectionCommitted,
    onStagedSelectionCanceled: props.onStagedSelectionCanceled,
    onUnrelatedNavigation: props.onUnrelatedNavigation,
    onSelectionStarted: closeDurableToolbar,
  });
  cancelStagedForDurableToolbarRef.current = cancelStaged;

  const rendererCapability = useMemo<ReaderRendererCapability | null>(() => {
    if (!engineCapability || !stagedSelectionCapability) return null;
    return { ...engineCapability, stagedSelection: stagedSelectionCapability };
  }, [engineCapability, stagedSelectionCapability]);

  useEffect(() => {
    props.onRendererCapabilityReady?.(rendererCapability);
    return () => props.onRendererCapabilityReady?.(null);
  }, [props.onRendererCapabilityReady, rendererCapability]);

  const recordReadableViewport = useCallback((generation: number) => {
    if (engineGenerationRef.current !== generation) return;
    hasReadableViewportRef.current = true;
  }, []);

  const markReadableViewport = useCallback((generation: number) => {
    if (engineGenerationRef.current !== generation) return;
    hasReadableViewportRef.current = true;
    setReadiness("ready");
  }, []);

  const reportOperationError = useCallback(
    (err: unknown, fallback: string, generation: number, kind: ReaderOperationFailureKind) => {
      if (engineGenerationRef.current !== generation) return;
      debugWarn("reader", "Reader operation did not complete", { kind, error: err });
      if (classifyReaderOperationError(kind, hasReadableViewportRef.current) === "fatal") {
        setReadiness("error");
        setErrorMessage(fallback);
      }
      onEventRef.current?.({ type: "displayError", error: err });
    },
    [],
  );

  const {
    clearDeferredCommand,
    flushDeferredCommand,
    runImmediateCommand,
  } = useReaderCommandRoutingLifecycle({
    command: props.command,
    readiness,
    engineRef,
    engineGenerationRef,
    onEventRef,
    reanchorStagedToolbarRef,
    bootstrapProgressGuard,
    runtimeController,
    stagedSelectionLifecycle: stagedLifecycle,
    markReadableViewport,
    reportOperationError,
    waitForLayout: waitForReaderLayout,
  });

  useReaderEngineBootstrapLifecycle({
    blob: props.blob,
    mountEl,
    engineRef,
    engineGenerationRef,
    hasReadableViewportRef,
    initialDisplayTargetRef,
    settingsRef,
    highlightMarksRef,
    onEventRef,
    reanchorStagedToolbarRef,
    bootstrapProgressGuard,
    runtimeController,
    stagedSelectionLifecycle: stagedLifecycle,
    onEngineSelectionChanged,
    onEngineHighlightClick,
    closeDurableToolbar,
    recordReadableViewport,
    markReadableViewport,
    setReadiness,
    setErrorMessage,
    reportOperationError,
    clearDeferredCommand,
    flushDeferredCommand,
    onRendererCapabilityReady: setEngineCapability,
  });

  useReaderSettingsReflowLifecycle({
    settings: props.settings,
    readiness,
    engineRef,
    engineGenerationRef,
    reanchorStagedToolbarRef,
    bootstrapProgressGuard,
    runtimeController,
    stagedSelectionLifecycle: stagedLifecycle,
    reportOperationError,
    waitForLayout: waitForReaderLayout,
  });

  useEffect(() => {
    if (!mountEl || !isReaderFullyReady(readiness)) return;
    const generation = engineGenerationRef.current;
    return observeReaderMountResize(mountEl, () => {
      void runtimeController.stabilizeReflow("resize", {
        reflow: (activeEngine) => stagedLifecycle.runNavigation(
          "layout-reflow",
          () => activeEngine.resizeToMount({
            preserveCfi: bootstrapProgressGuard.getProtectedRestoreCfi(generation),
          }),
        ),
        refreshMarks: (activeEngine) => activeEngine.refreshHighlightMarks(),
        reanchorStagedToolbar: () => reanchorStagedToolbarRef.current(),
      }).catch((err) => reportOperationError(err, "Reader resize failed.", generation, "reflow"));
    });
  }, [
    bootstrapProgressGuard,
    mountEl,
    props.blob,
    readiness,
    reportOperationError,
    runtimeController,
    stagedLifecycle,
  ]);

  const goPrev = async () => {
    await runImmediateCommand({ type: "previous" }, "Couldn't open that page. Try again.");
  };

  const goNext = async () => {
    await runImmediateCommand({ type: "next" }, "Couldn't open that page. Try again.");
  };

  return (
    <div className="spReadingShell">
      <ReaderViewport
        ref={mountRef}
        mountWrapperRef={mountWrapperRef}
        status={toReaderViewportStatus(readiness)}
        errorMessage={errorMessage ?? undefined}
        overlay={
          <>
            <button
              type="button"
              className="spReaderTocButton"
              onClick={() => setTocOpen(true)}
              disabled={!isReaderFullyReady(readiness)}
              aria-label="Table of contents"
              title="Table of contents"
            >
              <MaterialIcon name="menu" className="spReaderTocButtonIcon" />
            </button>

            <TableOfContentsDrawer
              open={tocOpen}
              toc={props.toc}
              currentHref={props.currentHref}
              onClose={() => setTocOpen(false)}
              onPickItem={(item) => {
                const href = typeof item.href === "string" ? item.href.trim() : "";
                if (href) props.onEvent?.({ type: "navigate", target: { type: "href", href } });
                setTocOpen(false);
              }}
            />
            {props.settings && props.onSettingsChange ? (
              <ReaderDisplaySettingsMenu
                open={settingsOpen}
                disabled={!isReaderFullyReady(readiness)}
                settings={props.settings}
                onOpen={() => setSettingsOpen(true)}
                onClose={() => setSettingsOpen(false)}
                onChange={props.onSettingsChange}
                onReset={props.onSettingsReset}
              />
            ) : null}
            <button
              type="button"
              className="spReaderPageNav spReaderPageNavPrev"
              onClick={goPrev}
              disabled={!isReaderFullyReady(readiness)}
              aria-label="Previous page"
              title="Previous page"
            >
              <MaterialIcon name="chevron_left" className="spReaderPageNavIcon" />
            </button>
            <button
              type="button"
              className="spReaderPageNav spReaderPageNavNext"
              onClick={goNext}
              disabled={!isReaderFullyReady(readiness)}
              aria-label="Next page"
              title="Next page"
            >
              <MaterialIcon name="chevron_right" className="spReaderPageNavIcon" />
            </button>

            {stagedToolbarProps ? <SelectionHighlightToolbar {...stagedToolbarProps} /> : null}
            {durableToolbarProps ? <DurableAnnotationToolbar {...durableToolbarProps} /> : null}
          </>
        }
      />
    </div>
  );
}

function waitForReaderLayout(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}
