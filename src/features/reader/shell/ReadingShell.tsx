import { useCallback, useEffect, useRef, useState } from "react";
import { createEpubTsBookEngine, type EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import { ReaderViewport } from "../viewport/ReaderViewport";
import type { ReaderSettings } from "../../../storage/readerSettings";
import type { ReaderHighlightMark, ReaderLocationTarget, ReaderSelection, ReaderTocItem } from "../domain/types";
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

export type ReadingShellProps = {
  blob: Blob;
  initialDisplayTarget?: ReaderLocationTarget;
  onEvent?: (event: ReadingShellEvent) => void;
  toc?: ReaderTocItem[] | null;
  command?: ReadingShellCommand;
  highlightMarks?: ReaderHighlightMark[];
  onCommitHighlight?: (input: { selection: ReaderSelection; color: string; note?: string }) => Promise<void>;
  highlightCommitBusy?: boolean;
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
  const lastHandledReaderWidthRef = useRef<ReaderSettings["readerWidth"] | null>(props.settings?.readerWidth ?? null);

  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
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

  const mountRef = useCallback((el: HTMLDivElement | null) => {
    setMountEl(el);
  }, []);

  const staged = useStagedSelectionToolbar({
    engineRef,
    mountWrapperRef,
    highlightMarks: props.highlightMarks,
    onCommitHighlight: props.onCommitHighlight,
    commitBusy: props.highlightCommitBusy,
  });
  const { onSelectionChanged, cancelStaged, stagedSelectionRef } = staged;

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
    async (engine: EpubTsBookEngine, command: ReadingShellCommandValue) => {
      switch (command.type) {
        case "display":
          await engine.display(command.target);
          return;
        case "next":
          await engine.next();
          return;
        case "previous":
          await engine.previous();
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
             if (stagedSelectionRef.current) cancelStaged();
             onEventRef.current?.({ type: "locationChanged", location });
           },
          onTocReady: (toc) => onEventRef.current?.({ type: "tocReady", toc }),
          onLocationsReady: () => onEventRef.current?.({ type: "locationsReady" }),
          onSelectionChanged,
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
              await runCommandOnEngine(engine, cmd.value);
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
    mountEl,
    onSelectionChanged,
    props.blob,
    props.onDescribeCfiReady,
    props.onSearchReady,
    reportCommandError,
    runCommandOnEngine,
    stagedSelectionRef,
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
        if (!engine) {
          deferredCommandRef.current = cmd;
          return;
        }
        await runCommandOnEngine(engine, cmd.value);
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
