import { useCallback, useEffect, useRef, useState } from "react";
import { createEpubTsBookEngine, type EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import { ReaderViewport } from "../viewport/ReaderViewport";
import type { ReaderAnnotation, ReaderLocationTarget } from "../domain/types";
import type { ReadingShellCommand, ReadingShellEvent } from "./types";

export type ReadingShellProps = {
  blob: Blob;
  initialDisplayTarget?: ReaderLocationTarget;
  annotations?: ReaderAnnotation[];
  onEvent?: (event: ReadingShellEvent) => void;
  onCommand?: (command: ReadingShellCommand) => void;
  command?: { seq: number; value: { type: "display"; target: ReaderLocationTarget } | { type: "next" } | { type: "previous" } };
  statusLine?: string;
  bookmark?: {
    enabled: boolean;
    isBookmarked: boolean;
    busy?: boolean;
    onToggle: () => void;
  };
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
          onError: (err) => props.onEvent?.({ type: "displayError", error: err }),
        });
        if (cancelled) {
          engine.destroy();
          return;
        }
        engineRef.current = engine;
        setStatus("ready");

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
      engine?.destroy();
    };
  }, [mountEl, props.blob, props.initialDisplayTarget, props.onEvent]);

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

  return (
    <div className="spReadingShell">
      <div className="spReadingShellBar">
        <div className="spReadingShellLabelBlock">
          <div className="muted spReadingShellLabel">ReadingShell (epub-ts)</div>
          {props.statusLine ? <div className="muted spReadingShellStatus">{props.statusLine}</div> : null}
        </div>
        <div className="spReadingShellNav">
          {props.bookmark ? (
            <button
              type="button"
              className="button buttonCompact"
              onClick={props.bookmark.onToggle}
              disabled={!props.bookmark.enabled || status !== "ready" || Boolean(props.bookmark.busy)}
              title={!props.bookmark.enabled ? "Bookmark is unavailable until a reading location is known." : undefined}
            >
              {props.bookmark.isBookmarked ? "Remove bookmark" : "Bookmark"}
            </button>
          ) : null}
          <button type="button" className="button buttonCompact" onClick={goPrev} disabled={status !== "ready"}>
            Previous
          </button>
          <button type="button" className="button buttonCompact" onClick={goNext} disabled={status !== "ready"}>
            Next
          </button>
        </div>
      </div>

      <ReaderViewport
        ref={mountRef}
        status={status}
        title="Viewport"
        errorMessage={errorMessage ?? undefined}
        footerText={`Source: Blob (${props.blob.size.toLocaleString()} bytes)`}
      />
    </div>
  );
}
