import { useCallback, useEffect, useRef, useState } from "react";
import { createEpubTsBookEngine, type EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import { ReaderViewport } from "../viewport/ReaderViewport";
import type { ReaderSettings } from "../../../storage/readerSettings";
import type { ReaderHighlightMark, ReaderLocationTarget, ReaderSelection, ReaderTocItem } from "../domain/types";
import type { ReaderLocationDescription } from "../domain/types";
import type { ReadingShellEvent } from "./types";
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
  command?: {
    seq: number;
    value: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" };
  };
  highlightMarks?: ReaderHighlightMark[];
  onCommitHighlight?: (input: { selection: ReaderSelection; color: string; note?: string }) => Promise<void>;
  highlightCommitBusy?: boolean;
  onDescribeCfiReady?: (fn: ((cfi: string) => Promise<ReaderLocationDescription>) | null) => void;
  settings?: ReaderSettings;
  onSettingsChange?: (patch: Partial<ReaderSettings>) => void;
  onSettingsReset?: () => void;
};

export function ReadingShell(props: ReadingShellProps) {
  const engineRef = useRef<EpubTsBookEngine | null>(null);
  const mountWrapperRef = useRef<HTMLDivElement | null>(null);
  const lastHandledCommandSeqRef = useRef<number | null>(null);
  const deferredCommandRef = useRef<ReadingShellProps["command"] | null>(null);

  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const highlightMarksRef = useRef<ReaderHighlightMark[]>(props.highlightMarks ?? []);
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

  useEffect(() => {
    if (!mountEl) return;

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    void (async () => {
      try {
         const engine = await createEpubTsBookEngine({
           source: props.blob,
           mountEl,
           // Locations generation currently can throw unhandled errors in epub-ts for some books.
           // Keep it opt-in until upstream behavior is reliable.
           enableLocationsGeneration: true,
           onLocationChanged: (location) => {
             if (stagedSelectionRef.current) cancelStaged();
             props.onEvent?.({ type: "locationChanged", location });
           },
          onTocReady: (toc) => props.onEvent?.({ type: "tocReady", toc }),
          onLocationsReady: () => props.onEvent?.({ type: "locationsReady" }),
          onSelectionChanged,
          onError: (err) => props.onEvent?.({ type: "displayError", error: err }),
        });

        if (cancelled) {
          engine.destroy();
          return;
        }

        engineRef.current = engine;
        setStatus("ready");
        props.onDescribeCfiReady?.((cfi) => engine.describeCfi(cfi));

        // Apply any highlight marks that loaded before the engine became available.
        engine.setHighlightMarks(highlightMarksRef.current);

        if (deferredCommandRef.current) {
          const cmd = deferredCommandRef.current;
          deferredCommandRef.current = null;
          if (cmd) {
            try {
              if (cmd.value.type === "display") await engine.display(cmd.value.target);
              else if (cmd.value.type === "next") await engine.next();
              else await engine.previous();
            } catch (err) {
              setStatus("error");
              setErrorMessage(err instanceof Error ? err.message : "Command failed.");
              props.onEvent?.({ type: "displayError", error: err });
            }
          }
        }

        if (!props.initialDisplayTarget) {
          try {
            await engine.display();
          } catch (err) {
            setStatus("error");
            setErrorMessage(err instanceof Error ? err.message : "Display failed.");
            props.onEvent?.({ type: "displayError", error: err });
          }
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Failed to initialize epub-ts engine.");
        props.onEvent?.({ type: "displayError", error: err });
      }
    })();

    return () => {
      cancelled = true;
      const engine = engineRef.current;
      engineRef.current = null;
      props.onDescribeCfiReady?.(null);
      engine?.destroy();
    };
  }, [
    cancelStaged,
    mountEl,
    onSelectionChanged,
    props.blob,
    props.initialDisplayTarget,
    props.onDescribeCfiReady,
    props.onEvent,
    stagedSelectionRef,
  ]);

  useEffect(() => {
    const cmd = props.command;
    if (!cmd) return;
    if (lastHandledCommandSeqRef.current === cmd.seq) return;
    lastHandledCommandSeqRef.current = cmd.seq;

    void (async () => {
      try {
        if (!engineRef.current) {
          deferredCommandRef.current = cmd;
          return;
        }
        switch (cmd.value.type) {
          case "display":
            await engineRef.current?.display(cmd.value.target);
            return;
          case "next":
            await engineRef.current?.next();
            return;
          case "previous":
            await engineRef.current?.previous();
            return;
        }
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Command failed.");
        props.onEvent?.({ type: "displayError", error: err });
      }
    })();
  }, [props.command, props.onEvent]);

  // Staged selection toolbar state is owned by `useStagedSelectionToolbar`.

  const goPrev = async () => {
    try {
      await engineRef.current?.previous();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Previous failed.");
      props.onEvent?.({ type: "displayError", error: err });
    }
  };

  const goNext = async () => {
    try {
      await engineRef.current?.next();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Next failed.");
      props.onEvent?.({ type: "displayError", error: err });
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
