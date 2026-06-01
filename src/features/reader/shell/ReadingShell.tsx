import { useCallback, useEffect, useRef, useState } from "react";
import { createEpubTsBookEngine, type EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import { ReaderViewport } from "../viewport/ReaderViewport";
import type { ReaderAnnotation, ReaderHighlightMark, ReaderLocationTarget, ReaderSelection } from "../domain/types";
import type { ReaderLocationDescription } from "../domain/types";
import type { ReadingShellCommand, ReadingShellEvent } from "./types";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { SelectionHighlightToolbar } from "./SelectionHighlightToolbar";

export type ReadingShellProps = {
  blob: Blob;
  initialDisplayTarget?: ReaderLocationTarget;
  annotations?: ReaderAnnotation[];
  onEvent?: (event: ReadingShellEvent) => void;
  onCommand?: (command: ReadingShellCommand) => void;
  command?: {
    seq: number;
    value: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" };
  };
  statusLine?: string;
  autosaveStatus?: { text: string; title?: string } | null;
  highlightMarks?: ReaderHighlightMark[];
  onCommitHighlight?: (input: { selection: ReaderSelection; color: string; note?: string }) => Promise<void>;
  highlightCommitBusy?: boolean;
  bookmark?: {
    enabled: boolean;
    isBookmarked: boolean;
    busy?: boolean;
    onToggle: () => void;
  };
  onDescribeCfiReady?: (fn: ((cfi: string) => Promise<ReaderLocationDescription>) | null) => void;
};

export function ReadingShell(props: ReadingShellProps) {
  const engineRef = useRef<EpubTsBookEngine | null>(null);
  const mountWrapperRef = useRef<HTMLDivElement | null>(null);
  const lastHandledCommandSeqRef = useRef<number | null>(null);
  const deferredCommandRef = useRef<ReadingShellProps["command"] | null>(null);

  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const highlightMarksRef = useRef<ReaderHighlightMark[]>(props.highlightMarks ?? []);
  useEffect(() => {
    highlightMarksRef.current = props.highlightMarks ?? [];
  }, [props.highlightMarks]);

  const [stagedSelection, setStagedSelection] = useState<ReaderSelection | null>(null);
  const stagedSelectionRef = useRef<ReaderSelection | null>(null);
  const [stagedColor, setStagedColor] = useState<string>("yellow");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [toolbarPos, setToolbarPos] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(
    null,
  );

  useEffect(() => {
    stagedSelectionRef.current = stagedSelection;
  }, [stagedSelection]);

  const mountRef = useCallback((el: HTMLDivElement | null) => {
    setMountEl(el);
  }, []);

  const cancelStaged = useCallback(() => {
    setStagedSelection(null);
    setStagedColor("yellow");
    setNoteOpen(false);
    setNoteDraft("");
    setToolbarPos(null);
    engineRef.current?.clearSelection();
  }, []);

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
          onLocationChanged: (location) => {
            if (stagedSelectionRef.current) cancelStaged();
            props.onEvent?.({ type: "locationChanged", location });
          },
          onTocReady: (toc) => props.onEvent?.({ type: "tocReady", toc }),
          onLocationsReady: () => props.onEvent?.({ type: "locationsReady" }),
          onSelectionChanged: (selection) => {
            if (!selection) {
              if (stagedSelectionRef.current) cancelStaged();
              return;
            }

            // Selecting new text discards any previous uncommitted staged highlight.
            setStagedSelection(selection);
            setStagedColor("yellow");
            setNoteOpen(false);
            setNoteDraft("");

            const wrapper = mountWrapperRef.current;
            const anchor = selection.anchor;
            if (wrapper && anchor) {
              const r = wrapper.getBoundingClientRect();
              const left = Math.max(12, Math.min(r.width - 12, anchor.x - r.left));
              const topRaw = Math.max(0, Math.min(r.height, anchor.y - r.top));
              const placement: "above" | "below" = topRaw < 72 ? "below" : "above";
              setToolbarPos({ left, top: topRaw, placement });
            } else if (wrapper) {
              const r = wrapper.getBoundingClientRect();
              setToolbarPos({ left: r.width / 2, top: 18, placement: "below" });
            } else {
              setToolbarPos(null);
            }
          },
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
  }, [cancelStaged, mountEl, props.blob, props.initialDisplayTarget, props.onDescribeCfiReady, props.onEvent]);

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

  useEffect(() => {
    if (!engineRef.current) return;
    const staged: ReaderHighlightMark[] =
      stagedSelection?.cfiRange ? [{ id: "__staged_selection__", cfiRange: stagedSelection.cfiRange, color: stagedColor }] : [];
    engineRef.current.setHighlightMarks([...(props.highlightMarks ?? []), ...staged]);
  }, [props.highlightMarks, stagedColor, stagedSelection]);

  useEffect(() => {
    if (!stagedSelection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelStaged();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelStaged, stagedSelection]);

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
      <div className="spReadingShellBar">
        <div className="spReadingShellLabelBlock">
          {props.statusLine ? <div className="spReadingShellStatus">{props.statusLine}</div> : null}
          {props.autosaveStatus ? (
            <div className="muted spReadingShellAutosave" title={props.autosaveStatus.title}>
              {props.autosaveStatus.text}
            </div>
          ) : null}
        </div>
        <div className="spReadingShellActions">
          {props.bookmark ? (
            <button
              type="button"
              className="button buttonCompact"
              onClick={props.bookmark.onToggle}
              disabled={!props.bookmark.enabled || status !== "ready" || Boolean(props.bookmark.busy)}
              title={!props.bookmark.enabled ? "Bookmark is unavailable until a reading location is known." : undefined}
              aria-label={props.bookmark.isBookmarked ? "Remove bookmark" : "Add bookmark"}
            >
              <MaterialIcon name={props.bookmark.isBookmarked ? "bookmark_added" : "bookmark_add"} />
              <span className="spIconButtonLabel">{props.bookmark.isBookmarked ? "Bookmarked" : "Bookmark"}</span>
            </button>
          ) : null}
        </div>
      </div>

      <ReaderViewport
        ref={mountRef}
        mountWrapperRef={mountWrapperRef}
        status={status}
        errorMessage={errorMessage ?? undefined}
        overlay={
          <>
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

            {stagedSelection && toolbarPos ? (
              <SelectionHighlightToolbar
                open={true}
                left={toolbarPos.left}
                top={toolbarPos.top}
                placement={toolbarPos.placement}
                color={stagedColor}
                noteOpen={noteOpen}
                noteDraft={noteDraft}
                busy={Boolean(props.highlightCommitBusy)}
                onPickColorAndCommit={async (color) => {
                  if (!props.onCommitHighlight || !stagedSelection) return;
                  setStagedColor(color);
                  try {
                    await props.onCommitHighlight({ selection: stagedSelection, color });
                    cancelStaged();
                  } catch {
                    // Keep staged highlight + toolbar open on failure.
                  }
                }}
                onOpenNote={() => setNoteOpen(true)}
                onChangeNoteDraft={(value) => setNoteDraft(value)}
                onSaveNote={async () => {
                  if (!props.onCommitHighlight || !stagedSelection) return;
                  try {
                    await props.onCommitHighlight({ selection: stagedSelection, color: stagedColor, note: noteDraft.trim() });
                    cancelStaged();
                  } catch {
                    // Keep staged highlight + toolbar open on failure.
                  }
                }}
                onCloseNote={() => setNoteOpen(false)}
                onCancel={cancelStaged}
              />
            ) : null}
          </>
        }
      />
    </div>
  );
}
