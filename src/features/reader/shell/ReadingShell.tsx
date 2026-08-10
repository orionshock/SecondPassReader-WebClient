import { useCallback, useEffect, useRef, useState } from "react";
import type { EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import type { HighlightMarkClick } from "../engine/highlightMarks";
import { ReaderViewport } from "../viewport/ReaderViewport";
import type { ReaderSettings } from "../../../storage/readerSettings";
import type { ReaderHighlightMark, ReaderLocationTarget, ReaderSelection, ReaderTocItem } from "../domain/types";
import type {
  ReadingShellCommand,
  ReadingShellEvent,
} from "./types";
import type {
  ReaderDescribeCfiHandle,
  ReaderDisplayCfiHandle,
  ReaderProbeCfiHandle,
  ReaderSearchBookHandle,
  StagedSelectionCommitInput,
  StagedSelectionHandle,
  StagedSelectionSource,
} from "../domain/ReaderBridge.Types";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { ReaderDisplaySettingsMenu } from "../settings/ReaderDisplaySettingsMenu";
import { SelectionHighlightToolbar } from "./SelectionHighlightToolbar";
import { TableOfContentsDrawer } from "./TableOfContentsDrawer";
import { useStagedSelectionToolbar } from "./useStagedSelectionToolbar";
import { DurableAnnotationToolbar, type DurableAnnotationToolbarItem, type DurableAnnotationToolbarPosition } from "./DurableAnnotationToolbar";
import { ReaderRuntimeController } from "./ReaderRuntime.Controller";
import { StagedSelectionLifecycle } from "./StagedSelection.Lifecycle";
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

export type ReadingShellProps = {
  blob: Blob;
  initialDisplayTarget?: ReaderLocationTarget;
  onEvent?: (event: ReadingShellEvent) => void;
  toc?: ReaderTocItem[] | null;
  command?: ReadingShellCommand;
  highlightMarks?: ReaderHighlightMark[];
  temporarySearchHighlightCfi?: string | null;
  onCommitHighlight?: (input: StagedSelectionCommitInput) => Promise<void>;
  highlightCommitBusy?: boolean;
  onStagedSelectionReady?: (handle: StagedSelectionHandle | null) => void;
  onStagedSelectionCommitted?: (source: StagedSelectionSource) => void;
  onStagedSelectionCanceled?: (source: StagedSelectionSource) => void;
  onUnrelatedNavigation?: () => void;
  annotationToolbarItems?: DurableAnnotationToolbarItem[];
  onUpdateHighlight?: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
  onRemoveAnnotation?: (annotationId: string) => Promise<void>;
  onOpenAnnotationInWorkspace?: (annotationId: string, mode: "editable" | "readonly") => void;
  onDescribeCfiReady?: (fn: ReaderDescribeCfiHandle | null) => void;
  onProbeCfiReady?: (fn: ReaderProbeCfiHandle | null) => void;
  onDisplayCfiReady?: (fn: ReaderDisplayCfiHandle | null) => void;
  onSearchReady?: (fn: ReaderSearchBookHandle | null) => void;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onSettingsReset?: () => void;
};

type DurableToolbarAnchor = {
  clientX?: number;
  clientY?: number;
  bounds?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  };
};

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
  const onUnrelatedNavigationRef = useRef<ReadingShellProps["onUnrelatedNavigation"]>(props.onUnrelatedNavigation);
  const lastHandledReaderWidthRef = useRef<ReaderSettings["readerWidth"] | null>(props.settings?.readerWidth ?? null);

  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const [readiness, setReadiness] = useState<ReaderReadinessState>("empty");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [durableToolbar, setDurableToolbar] = useState<{ annotationId: string; position: DurableAnnotationToolbarPosition } | null>(null);

  const highlightMarksRef = useRef<ReaderHighlightMark[]>(props.highlightMarks ?? []);
  const annotationToolbarItemsRef = useRef<DurableAnnotationToolbarItem[]>(props.annotationToolbarItems ?? []);
  useEffect(() => {
    settingsRef.current = props.settings;
  }, [props.settings]);

  useEffect(() => {
    onEventRef.current = props.onEvent;
  }, [props.onEvent]);

  useEffect(() => {
    onUnrelatedNavigationRef.current = props.onUnrelatedNavigation;
  }, [props.onUnrelatedNavigation]);

  useEffect(() => {
    initialDisplayTargetRef.current = props.initialDisplayTarget;
  }, [props.initialDisplayTarget]);

  useEffect(() => {
    highlightMarksRef.current = props.highlightMarks ?? [];
  }, [props.highlightMarks]);

  useEffect(() => {
    annotationToolbarItemsRef.current = props.annotationToolbarItems ?? [];
  }, [props.annotationToolbarItems]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setTemporarySearchHighlight(props.temporarySearchHighlightCfi ?? null);
  }, [props.temporarySearchHighlightCfi]);

  const mountRef = useCallback((el: HTMLDivElement | null) => {
    setMountEl(el);
  }, []);

  const staged = useStagedSelectionToolbar({
    engineRef,
    mountWrapperRef,
    highlightMarks: props.highlightMarks,
    onCommitHighlight: props.onCommitHighlight,
    onStagedSelectionCommitted: props.onStagedSelectionCommitted,
    onStagedSelectionCanceled: props.onStagedSelectionCanceled,
    commitBusy: props.highlightCommitBusy,
  });
  const { onSelectionChanged, cancelStaged } = staged;
  const stagedLifecycleRef = useRef<StagedSelectionLifecycle | null>(null);
  if (!stagedLifecycleRef.current) {
    stagedLifecycleRef.current = new StagedSelectionLifecycle({
      cancelStagedSelection: cancelStaged,
      hasStagedSelection: staged.hasStagedSelection,
      onUnrelatedNavigation: () => onUnrelatedNavigationRef.current?.(),
    });
  }
  const stagedLifecycle = stagedLifecycleRef.current;
  const reanchorStagedToolbarRef = useRef(staged.reanchorStagedToolbar);
  reanchorStagedToolbarRef.current = staged.reanchorStagedToolbar;

  const closeDurableToolbar = useCallback(() => {
    setDurableToolbar(null);
  }, []);

  const toToolbarPosition = useCallback((anchor?: DurableToolbarAnchor): DurableAnnotationToolbarPosition | null => {
    const margin = 12;
    const width = window.innerWidth || document.documentElement.clientWidth || 1;
    const height = window.innerHeight || document.documentElement.clientHeight || 1;
    const toolbarWidth = Math.min(340, Math.max(220, width - margin * 2));
    const toolbarHeight = 160;
    const leftRaw = typeof anchor?.clientX === "number" ? anchor.clientX : width / 2;
    const topRaw = typeof anchor?.clientY === "number" ? anchor.clientY : height / 2;
    const preferredPlacement = chooseClickToolbarPlacement({
      clickX: leftRaw,
      clickY: topRaw,
      height,
      margin,
      toolbarHeight,
      toolbarWidth,
      width,
    });
    return clampClickToolbarPosition({
      clickX: leftRaw,
      clickY: topRaw,
      height,
      margin,
      placement: preferredPlacement,
      toolbarHeight,
      toolbarWidth,
      width,
    });
  }, []);

  const onEngineSelectionChanged = useCallback((selection: ReaderSelection | null) => {
    if (selection) closeDurableToolbar();
    onSelectionChanged(selection);
  }, [closeDurableToolbar, onSelectionChanged]);

  const onEngineHighlightClick = useCallback((click: HighlightMarkClick) => {
    const id = click.annotationId.trim();
    if (!id) return;
    const item = annotationToolbarItemsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    const position = toToolbarPosition(click);
    if (!position) return;
    cancelStaged();
    setDurableToolbar({ annotationId: id, position });
  }, [cancelStaged, toToolbarPosition]);

  useEffect(() => {
    if (!isReaderFullyReady(readiness)) {
      props.onStagedSelectionReady?.(null);
      return;
    }
    props.onStagedSelectionReady?.({
      stageSelectionFromCfiRange: staged.stageSelectionFromCfiRange,
      runStagingTransaction: (operation) => stagedLifecycle.runNavigation("import-staging", operation),
      cancelStagedSelection: staged.cancelStaged,
    });
    return () => props.onStagedSelectionReady?.(null);
  }, [props.onStagedSelectionReady, readiness, staged.cancelStaged, staged.stageSelectionFromCfiRange, stagedLifecycle]);

  useEffect(() => {
    if (!durableToolbar) return;
    if (props.annotationToolbarItems?.some((item) => item.id === durableToolbar.annotationId)) return;
    setDurableToolbar(null);
  }, [durableToolbar, props.annotationToolbarItems]);

  useEffect(() => {
    if (!durableToolbar) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDurableToolbar();
    };
    const onPointerDown = () => closeDurableToolbar();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closeDurableToolbar, durableToolbar]);

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
      if (classifyReaderOperationError(kind, hasReadableViewportRef.current) === "fatal") {
        setReadiness("error");
        setErrorMessage(err instanceof Error ? err.message : fallback);
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
    onDescribeCfiReady: props.onDescribeCfiReady,
    onProbeCfiReady: props.onProbeCfiReady,
    onDisplayCfiReady: props.onDisplayCfiReady,
    onSearchReady: props.onSearchReady,
  });

  useEffect(() => {
    if (!props.settings) return;
    if (!isReaderFullyReady(readiness)) return;
    const engine = engineRef.current;
    if (!engine) return;
    const generation = engineGenerationRef.current;

    void (async () => {
      try {
        await runtimeController.stabilizeReflow("settings", {
          reflow: (activeEngine) => stagedLifecycle.runNavigation(
            "layout-reflow",
            () => activeEngine.applyDisplaySettings(props.settings!, {
              preserveCfi: bootstrapProgressGuard.getProtectedRestoreCfi(generation),
            }),
          ),
          refreshMarks: (activeEngine) => activeEngine.refreshHighlightMarks(),
          reanchorStagedToolbar: () => reanchorStagedToolbarRef.current(),
        });
      } catch (err) {
        reportOperationError(err, "Display settings failed.", generation, "reflow");
      }
    })();
  }, [
    bootstrapProgressGuard,
    props.settings,
    readiness,
    reportOperationError,
    runtimeController,
    stagedLifecycle,
  ]);

  useEffect(() => {
    const readerWidth = props.settings?.readerWidth;
    if (!readerWidth) return;
    if (!isReaderFullyReady(readiness)) return;
    if (lastHandledReaderWidthRef.current === readerWidth) return;
    lastHandledReaderWidthRef.current = readerWidth;

    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;
    const generation = engineGenerationRef.current;

    void (async () => {
      try {
        await runtimeController.stabilizeReflow("resize", {
          reflow: async (activeEngine) => {
            await stagedLifecycle.runNavigation("layout-reflow", async () => {
              await waitForReaderLayout();
              if (cancelled) return;
              await activeEngine.resizeToMount({
                preserveCfi: bootstrapProgressGuard.getProtectedRestoreCfi(generation),
              });
            });
          },
          refreshMarks: (activeEngine) => {
            if (!cancelled) activeEngine.refreshHighlightMarks();
          },
          reanchorStagedToolbar: () => cancelled ? Promise.resolve() : reanchorStagedToolbarRef.current(),
        });
      } catch (err) {
        if (cancelled) return;
        reportOperationError(err, "Reader resize failed.", generation, "reflow");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapProgressGuard,
    props.settings?.readerWidth,
    readiness,
    reportOperationError,
    runtimeController,
    stagedLifecycle,
  ]);

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

  // Staged selection toolbar state is owned by `useStagedSelectionToolbar`.

  const goPrev = async () => {
    await runImmediateCommand({ type: "previous" }, "Previous page failed.");
  };

  const goNext = async () => {
    await runImmediateCommand({ type: "next" }, "Next page failed.");
  };

  const durableToolbarItem =
    durableToolbar && props.annotationToolbarItems
      ? props.annotationToolbarItems.find((item) => item.id === durableToolbar.annotationId) ?? null
      : null;

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
              aria-label="Table of Contents"
              title="Table of Contents"
            >
              <MaterialIcon name="menu" className="spReaderTocButtonIcon" />
            </button>

            <TableOfContentsDrawer
              open={tocOpen}
              toc={props.toc}
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

            {staged.stagedSelection && staged.toolbarPos ? (
              <SelectionHighlightToolbar
                open={true}
                left={staged.toolbarPos.left}
                top={staged.toolbarPos.top}
                placement={staged.toolbarPos.placement}
                color={staged.stagedColor}
                noteOpen={staged.noteOpen}
                noteDraft={staged.noteDraft}
                busy={staged.commitBusy}
                onPickColorAndCommit={staged.commitColor}
                onToggleNote={staged.toggleNote}
                onChangeNoteDraft={staged.setNoteDraft}
                onCancel={staged.cancelStaged}
                onSizeChange={staged.onToolbarSizeChange}
              />
            ) : null}
            {durableToolbar && durableToolbarItem ? (
              <DurableAnnotationToolbar
                item={durableToolbarItem}
                position={durableToolbar.position}
                busy={props.highlightCommitBusy}
                theme={props.settings?.theme}
                onSave={(update) => {
                  if (durableToolbarItem.mode !== "editable" || !props.onUpdateHighlight) return Promise.resolve();
                  return props.onUpdateHighlight(durableToolbarItem.id, update);
                }}
                onDelete={() => {
                  if (durableToolbarItem.mode !== "editable" || !props.onRemoveAnnotation) return;
                  if (!window.confirm("Delete this annotation?")) return;
                  const id = durableToolbarItem.id;
                  closeDurableToolbar();
                  void props.onRemoveAnnotation(id);
                }}
                onOpenWorkspace={() => {
                  props.onOpenAnnotationInWorkspace?.(durableToolbarItem.id, durableToolbarItem.mode);
                  closeDurableToolbar();
                }}
                onClose={closeDurableToolbar}
              />
            ) : null}
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

function chooseClickToolbarPlacement({
  clickX,
  clickY,
  height,
  margin,
  toolbarHeight,
  toolbarWidth,
  width,
}: {
  clickX: number;
  clickY: number;
  height: number;
  margin: number;
  toolbarHeight: number;
  toolbarWidth: number;
  width: number;
}): DurableAnnotationToolbarPosition["placement"] {
  const fitsRight = clickX + toolbarWidth <= width - margin;
  const fitsLeft = clickX - toolbarWidth >= margin;
  if (clickX < width / 2 && fitsRight) return "right";
  if (clickX >= width / 2 && fitsLeft) return "left";
  if (fitsRight) return "right";
  if (fitsLeft) return "left";

  const fitsBelow = clickY + toolbarHeight <= height - margin;
  const fitsAbove = clickY - toolbarHeight >= margin;
  if (clickY < height / 2 && fitsBelow) return "below";
  if (fitsAbove) return "above";
  return fitsBelow ? "below" : "above";
}

function clampClickToolbarPosition({
  clickX,
  clickY,
  height,
  margin,
  placement,
  toolbarHeight,
  toolbarWidth,
  width,
}: {
  clickX: number;
  clickY: number;
  height: number;
  margin: number;
  placement: DurableAnnotationToolbarPosition["placement"];
  toolbarHeight: number;
  toolbarWidth: number;
  width: number;
}): DurableAnnotationToolbarPosition {
  if (placement === "left" || placement === "right") {
    return {
      left: placement === "left" ? Math.max(toolbarWidth + margin, clickX) : Math.min(width - toolbarWidth - margin, clickX),
      top: clamp(clickY, margin + toolbarHeight / 2, height - margin - toolbarHeight / 2),
      placement,
    };
  }

  return {
    left: clamp(clickX, margin + toolbarWidth / 2, width - margin - toolbarWidth / 2),
    top: placement === "above" ? Math.max(toolbarHeight + margin, clickY) : Math.min(height - toolbarHeight - margin, clickY),
    placement,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
