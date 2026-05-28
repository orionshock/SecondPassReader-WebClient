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
};

export function ReadingShell(props: ReadingShellProps) {
  const engineRef = useRef<EpubTsBookEngine | null>(null);
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
          initialTarget: props.initialDisplayTarget,
          onLocationChanged: (location) => props.onEvent?.({ type: "locationChanged", location }),
          onError: (err) => props.onEvent?.({ type: "displayError", error: err }),
        });
        if (cancelled) {
          engine.destroy();
          return;
        }
        engineRef.current = engine;
        setStatus("ready");
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
        <div className="muted spReadingShellLabel">ReadingShell (epub-ts)</div>
        <div className="spReadingShellNav">
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
