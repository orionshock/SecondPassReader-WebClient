import { useCallback, useEffect, useRef, useState } from "react";
import { createEpubTsBookEngine, type EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import { ReaderViewport } from "../viewport/ReaderViewport";
import type { ReaderSettings } from "../../../storage/readerSettings";
import type { ReaderHighlightMark, ReaderLocationTarget, ReaderTocItem } from "../domain/types";
import type {
  ReaderDescribeCfiHandle,
  ReaderSearchBookHandle,
  ReadingShellCommand,
  ReadingShellCommandValue,
  ReadingShellEvent,
} from "./types";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { ReaderDisplaySettingsMenu } from "../settings/ReaderDisplaySettingsMenu";
import { SelectionHighlightToolbar } from "./SelectionHighlightToolbar";
import { TableOfContentsDrawer } from "./TableOfContentsDrawer";
import { useStagedSelectionToolbar } from "./useStagedSelectionToolbar";
import type { StagedSelectionCommitInput, StagedSelectionHandle, StagedSelectionSource } from "./stagedSelectionTypes";
import { DurableAnnotationToolbar, type DurableAnnotationToolbarItem, type DurableAnnotationToolbarPosition } from "./DurableAnnotationToolbar";

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
  annotationToolbarItems?: DurableAnnotationToolbarItem[];
  onUpdateHighlight?: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
  onRemoveAnnotation?: (annotationId: string) => Promise<void>;
  onOpenAnnotationInWorkspace?: (annotationId: string, mode: "editable" | "readonly") => void;
  onDescribeCfiReady?: (fn: ReaderDescribeCfiHandle | null) => void;
  onSearchReady?: (fn: ReaderSearchBookHandle | null) => void;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onSettingsReset?: () => void;
};

export function ReadingShell(props: ReadingShellProps) {
  const engineRef = useRef<EpubTsBookEngine | null>(null);
  const mountWrapperRef = useRef<HTMLDivElement | null>(null);
  const lastHandledCommandSeqRef = useRef<number | null>(null);
  const deferredCommandRef = useRef<ReadingShellCommand | null>(null);
  const engineGenerationRef = useRef(0);
  const settingsRef = useRef<ReaderSettings | undefined>(props.settings);
  const initialDisplayTargetRef = useRef<ReaderLocationTarget | undefined>(props.initialDisplayTarget);
  const onEventRef = useRef<ReadingShellProps["onEvent"]>(props.onEvent);
  const latestSearchResultCommandRef = useRef<{ seq: number; cfi: string } | null>(null);
  const lastHandledReaderWidthRef = useRef<ReaderSettings["readerWidth"] | null>(props.settings?.readerWidth ?? null);

  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
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
  const { onSelectionChanged, cancelStaged, shouldCancelOnLocationChange } = staged;

  const closeDurableToolbar = useCallback(() => {
    setDurableToolbar(null);
  }, []);

  const toToolbarPosition = useCallback((clientX?: number, clientY?: number): DurableAnnotationToolbarPosition | null => {
    const wrapper = mountWrapperRef.current;
    if (!wrapper) return null;
    const r = wrapper.getBoundingClientRect();
    const leftRaw = typeof clientX === "number" ? clientX - r.left : r.width / 2;
    const topRaw = typeof clientY === "number" ? clientY - r.top : 18;
    const left = Math.max(14, Math.min(r.width - 14, leftRaw));
    const top = Math.max(0, Math.min(r.height, topRaw));
    return { left, top, placement: top < 96 ? "below" : "above" };
  }, []);

  useEffect(() => {
    props.onStagedSelectionReady?.({
      stageSelectionFromCfiRange: staged.stageSelectionFromCfiRange,
      cancelStagedSelection: staged.cancelStaged,
    });
    return () => props.onStagedSelectionReady?.(null);
  }, [props.onStagedSelectionReady, staged.cancelStaged, staged.stageSelectionFromCfiRange]);

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

  const reportCommandError = useCallback(
    (err: unknown, fallback: string, generation: number) => {
      if (engineGenerationRef.current !== generation) return;
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : fallback);
      onEventRef.current?.({ type: "displayError", error: err });
    },
    [],
  );

  const runCommandOnEngine = useCallback(
    async (engine: EpubTsBookEngine, command: ReadingShellCommandValue, commandSeq?: number) => {
      switch (command.type) {
        case "display":
          await engine.display(command.target);
          return;
        case "displaySearchResult": {
          await engine.display({ type: "cfi", cfi: command.cfi });
          const latestSearch = latestSearchResultCommandRef.current;
          if (commandSeq != null && latestSearch && latestSearch.seq !== commandSeq) {
            await engine.display({ type: "cfi", cfi: latestSearch.cfi });
            return;
          }
          // Search result flashes are temporary visual state. Paint them only
          // after display settles so the mark is attached to the target view.
          if (commandSeq != null && lastHandledCommandSeqRef.current !== commandSeq) return;
          engine.setTemporarySearchHighlight(command.cfi);
          onEventRef.current?.({ type: "searchResultDisplayed", cfi: command.cfi });
          return;
        }
        case "next":
          await engine.next();
          return;
        case "previous":
          await engine.previous();
          return;
        case "resize":
          await waitForReaderLayout();
          await engine.resizeToMount();
          return;
      }
    },
    [],
  );

  useEffect(() => {
    if (!mountEl) return;

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);
    engineGenerationRef.current += 1;
    const generation = engineGenerationRef.current;

    void (async () => {
      try {
         const engine = await createEpubTsBookEngine({
           source: props.blob,
           mountEl,
           // Locations generation currently can throw unhandled errors in epub-ts for some books.
           // Keep it opt-in until upstream behavior is reliable.
           enableLocationsGeneration: true,
           displaySettings: settingsRef.current,
           onLocationChanged: (location) => {
             closeDurableToolbar();
             if (shouldCancelOnLocationChange()) cancelStaged();
             onEventRef.current?.({ type: "locationChanged", location });
           },
          onTocReady: (toc) => onEventRef.current?.({ type: "tocReady", toc }),
          onLocationsReady: () => onEventRef.current?.({ type: "locationsReady" }),
          onSelectionChanged: (selection) => {
            if (selection) closeDurableToolbar();
            onSelectionChanged(selection);
          },
          onHighlightClick: (click) => {
            const id = click.annotationId.trim();
            if (!id) return;
            const item = annotationToolbarItemsRef.current.find((candidate) => candidate.id === id);
            if (!item) return;
            const position = toToolbarPosition(click.clientX, click.clientY);
            if (!position) return;
            cancelStaged();
            setDurableToolbar({ annotationId: id, position });
          },
          onError: (err) => onEventRef.current?.({ type: "displayError", error: err }),
        });

        if (cancelled) {
          engine.destroy();
          return;
        }

        engineRef.current = engine;
        setStatus("ready");
        props.onDescribeCfiReady?.((cfi) => {
          if (engineRef.current !== engine || engineGenerationRef.current !== generation) {
            return Promise.reject(new Error("Reader engine is not ready."));
          }
          return engine.describeCfi(cfi);
        });
        props.onSearchReady?.((query, options) => {
          if (engineRef.current !== engine || engineGenerationRef.current !== generation) {
            return Promise.reject(new Error("Reader engine is not ready."));
          }
          return engine.searchBook(query, options);
        });

        // Apply any highlight marks that loaded before the engine became available.
        engine.setHighlightMarks(highlightMarksRef.current);

        if (deferredCommandRef.current) {
          const cmd = deferredCommandRef.current;
          deferredCommandRef.current = null;
          if (cmd) {
            try {
              await runCommandOnEngine(engine, cmd.value, cmd.seq);
            } catch (err) {
              reportCommandError(err, "Command failed.", generation);
            }
          }
        }

        if (!initialDisplayTargetRef.current) {
          try {
            await engine.display();
          } catch (err) {
            reportCommandError(err, "Display failed.", generation);
          }
        }
      } catch (err) {
        if (cancelled) return;
        reportCommandError(err, "Failed to initialize epub-ts engine.", generation);
      }
    })();

    return () => {
      cancelled = true;
      engineGenerationRef.current += 1;
      deferredCommandRef.current = null;
      const engine = engineRef.current;
      engineRef.current = null;
      props.onDescribeCfiReady?.(null);
      props.onSearchReady?.(null);
      engine?.destroy();
    };
  }, [
    cancelStaged,
    closeDurableToolbar,
    mountEl,
    onSelectionChanged,
    props.blob,
    props.onDescribeCfiReady,
    props.onSearchReady,
    reportCommandError,
    runCommandOnEngine,
    shouldCancelOnLocationChange,
    toToolbarPosition,
  ]);

  useEffect(() => {
    const cmd = props.command;
    if (!cmd) return;
    if (lastHandledCommandSeqRef.current === cmd.seq) return;
    lastHandledCommandSeqRef.current = cmd.seq;

    void (async () => {
      const generation = engineGenerationRef.current;
      try {
        const engine = engineRef.current;
        if (cmd.value.type === "displaySearchResult") {
          latestSearchResultCommandRef.current = { seq: cmd.seq, cfi: cmd.value.cfi };
        }
        if (!engine) {
          deferredCommandRef.current = cmd;
          return;
        }
        await runCommandOnEngine(engine, cmd.value, cmd.seq);
      } catch (err) {
        reportCommandError(err, "Command failed.", generation);
      }
    })();
  }, [props.command, reportCommandError, runCommandOnEngine]);

  useEffect(() => {
    if (!props.settings) return;
    const engine = engineRef.current;
    if (!engine) return;
    const generation = engineGenerationRef.current;

    void (async () => {
      try {
        await engine.applyDisplaySettings(props.settings!);
      } catch (err) {
        reportCommandError(err, "Display settings failed.", generation);
      }
    })();
  }, [props.settings, reportCommandError]);

  useEffect(() => {
    const readerWidth = props.settings?.readerWidth;
    if (!readerWidth) return;
    if (lastHandledReaderWidthRef.current === readerWidth) return;
    lastHandledReaderWidthRef.current = readerWidth;

    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;
    const generation = engineGenerationRef.current;

    void (async () => {
      try {
        await waitForReaderLayout();
        if (cancelled) return;
        await engine.resizeToMount();
      } catch (err) {
        if (cancelled) return;
        reportCommandError(err, "Reader resize failed.", generation);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.settings?.readerWidth, reportCommandError]);

  // Staged selection toolbar state is owned by `useStagedSelectionToolbar`.

  const goPrev = async () => {
    const generation = engineGenerationRef.current;
    try {
      const engine = engineRef.current;
      if (!engine) return;
      await runCommandOnEngine(engine, { type: "previous" });
    } catch (err) {
      reportCommandError(err, "Previous failed.", generation);
    }
  };

  const goNext = async () => {
    const generation = engineGenerationRef.current;
    try {
      const engine = engineRef.current;
      if (!engine) return;
      await runCommandOnEngine(engine, { type: "next" });
    } catch (err) {
      reportCommandError(err, "Next failed.", generation);
    }
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
        status={status}
        errorMessage={errorMessage ?? undefined}
        overlay={
          <>
            <button
              type="button"
              className="spReaderTocButton"
              onClick={() => setTocOpen(true)}
              disabled={status !== "ready"}
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
                disabled={status !== "ready"}
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
              disabled={status !== "ready"}
              aria-label="Previous page"
              title="Previous page"
            >
              <MaterialIcon name="chevron_left" className="spReaderPageNavIcon" />
            </button>
            <button
              type="button"
              className="spReaderPageNav spReaderPageNavNext"
              onClick={goNext}
              disabled={status !== "ready"}
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
              />
            ) : null}
            {durableToolbar && durableToolbarItem ? (
              <DurableAnnotationToolbar
                item={durableToolbarItem}
                position={durableToolbar.position}
                busy={props.highlightCommitBusy}
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
