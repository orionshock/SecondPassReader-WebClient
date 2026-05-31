import { useCallback, useEffect, useRef, useState } from "react";
import { createEpubTsBookEngine, type EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import { ReaderViewport } from "../viewport/ReaderViewport";
import type { ReaderAnnotation, ReaderLocationTarget, ReaderSelection } from "../domain/types";
import type { ReaderLocationDescription } from "../domain/types";
import type { ReadingShellCommand, ReadingShellEvent } from "./types";

export type ReadingShellProps = {
  blob: Blob;
  initialDisplayTarget?: ReaderLocationTarget;
  annotations?: ReaderAnnotation[];
  onEvent?: (event: ReadingShellEvent) => void;
  onCommand?: (command: ReadingShellCommand) => void;
  command?: { seq: number; value: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" } };
  statusLine?: string;
  autosaveStatus?: { text: string; title?: string } | null;
  selection?: ReaderSelection | null;
  selectionActions?: {
    enabled: boolean;
    busy?: boolean;
    onHighlight: () => void;
    onCancel: () => void;
  };
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
  const lastHandledCommandSeqRef = useRef<number | null>(null);
  const deferredCommandRef = useRef<ReadingShellProps["command"] | null>(null);
  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mountRef = useCallback((el: HTMLDivElement | null) => {
    setMountEl(el);
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
          onLocationChanged: (location) => props.onEvent?.({ type: "locationChanged", location }),
          onTocReady: (toc) => props.onEvent?.({ type: "tocReady", toc }),
          onLocationsReady: () => props.onEvent?.({ type: "locationsReady" }),
          onSelectionChanged: (selection) => props.onEvent?.({ type: "selectionChanged", selection }),
          onError: (err) => props.onEvent?.({ type: "displayError", error: err }),
        });
        if (cancelled) {
          engine.destroy();
          return;
        }
        engineRef.current = engine;
        setStatus("ready");
        props.onDescribeCfiReady?.((cfi) => engine.describeCfi(cfi));

        if (deferredCommandRef.current) {
          const cmd = deferredCommandRef.current;
          deferredCommandRef.current = null;
          if (cmd) {
            // best-effort execute deferred command now that engine exists
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

        // If nothing has asked for a specific display target yet, display the default start location.
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
  }, [mountEl, props.blob, props.initialDisplayTarget, props.onDescribeCfiReady, props.onEvent]);

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

  const selectionActions = props.selectionActions;

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
          {props.selection && selectionActions ? (
            <div className="spReaderSelectionActions">
              <div className="muted spReaderSelectionPreview">{props.selection.text.slice(0, 48)}{props.selection.text.length > 48 ? "…" : ""}</div>
              <button
                type="button"
                className="button buttonCompact"
                onClick={() => {
                  // Clear visual selection immediately; the orchestrator already has the selection data.
                  engineRef.current?.clearSelection();
                  selectionActions.onHighlight();
                }}
                disabled={!selectionActions.enabled || status !== "ready" || Boolean(selectionActions.busy)}
              >
                Highlight
              </button>
              <button
                type="button"
                className="button buttonCompact"
                onClick={() => {
                  selectionActions.onCancel();
                  engineRef.current?.clearSelection();
                }}
                disabled={status !== "ready"}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {props.bookmark ? (
            <button
              type="button"
              className="button buttonCompact"
              onClick={props.bookmark.onToggle}
              disabled={!props.bookmark.enabled || status !== "ready" || Boolean(props.bookmark.busy)}
              title={!props.bookmark.enabled ? "Bookmark is unavailable until a reading location is known." : undefined}
            >
              {props.bookmark.isBookmarked ? "Bookmarked" : "Bookmark"}
            </button>
          ) : null}
        </div>
      </div>

      <ReaderViewport
        ref={mountRef}
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
              Prev
            </button>
            <button
              type="button"
              className="spReaderPageNav spReaderPageNavNext"
              onClick={goNext}
              disabled={status !== "ready"}
              aria-label="Next page"
              title="Next page"
            >
              Next
            </button>
          </>
        }
      />
    </div>
  );
}
