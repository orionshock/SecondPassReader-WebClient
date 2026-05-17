import { useEffect, useMemo, useRef, useState } from "react";
import { ReactReader } from "react-reader";
import type { LocalHighlight } from "./types";

// Renderer spike: keep react-reader usage isolated here.
// TODO: Move renderer interactions behind ReaderBridge before adding annotations/sessions.

export function EpubReaderPanel({
  blob,
  highlights,
  onLocationChanged,
  onHighlightCreated,
  onHighlightClicked,
  onRendererError,
}: {
  blob: Blob;
  highlights: LocalHighlight[];
  onLocationChanged?: (location: string) => void;
  onHighlightCreated?: (highlight: LocalHighlight) => void;
  onHighlightClicked?: (highlightId: string) => void;
  onRendererError?: (message: string) => void;
}) {
  const [location, setLocation] = useState<string | number | null>(null);
  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renditionReady, setRenditionReady] = useState(false);
  const [navStatus, setNavStatus] = useState<string>("idle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renditionRef = useRef<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedHandlerRef = useRef<((cfiRange: string) => void) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlerAttachedToRef = useRef<any | null>(null);
  const renderedCfisRef = useRef<Set<string>>(new Set());
  const highlightByCfiRef = useRef<Map<string, LocalHighlight>>(new Map());

  const highlightIndex = useMemo(() => {
    const byCfi = new Map<string, LocalHighlight>();
    for (const h of highlights) byCfi.set(h.cfiRange, h);
    return byCfi;
  }, [highlights]);

  useEffect(() => {
    highlightByCfiRef.current = highlightIndex;
  }, [highlightIndex]);

  useEffect(() => {
    let cancelled = false;
    setBookData(null);
    setLoadError(null);
    setLocation(null);
    renditionRef.current = null;
    setRenditionReady(false);
    setNavStatus("idle");
    // eslint-disable-next-line no-console
    console.log("[reader] EpubReaderPanel: loading new blob");

    void (async () => {
      try {
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        setBookData(buf);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to read EPUB blob.");
        // Safe to log: no tokens, no blob contents.
        // eslint-disable-next-line no-console
        console.error("EPUB blob to ArrayBuffer failed:", e);
        onRendererError?.(e instanceof Error ? e.message : "Failed to read EPUB blob.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  // Reconcile highlight overlays whenever highlights change and rendition is available.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    try {
      const rendered = renderedCfisRef.current;
      const next = new Set<string>(highlights.map((h) => h.cfiRange));

      // Remove any previously-rendered highlights that no longer exist.
      for (const cfi of Array.from(rendered)) {
        if (!next.has(cfi)) {
          rendition.annotations.remove(cfi, "highlight");
          rendered.delete(cfi);
        }
      }

      // Add new highlights that aren't rendered yet.
      for (const h of highlights) {
        if (rendered.has(h.cfiRange)) continue;
        rendition.annotations.highlight(
          h.cfiRange,
          { id: h.id },
          () => onHighlightClicked?.(h.id),
          "sp-local-highlight",
        );
        rendered.add(h.cfiRange);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Highlight reconcile failed:", e);
      onRendererError?.(e instanceof Error ? e.message : "Highlight reconcile failed.");
    }
  }, [highlights, highlightIndex, onHighlightClicked, onRendererError]);

  function createHighlightId() {
    return `lh_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  async function extractSelectedText(cfiRange: string): Promise<string> {
    // Prefer epubjs range extraction if available; fallback to DOM selection.
    const rendition = renditionRef.current;
    try {
      const book = rendition?.book;
      if (book?.getRange) {
        const range = await book.getRange(cfiRange);
        const text = range?.toString?.();
        if (text && typeof text === "string") return text.trim();
      }
    } catch {
      // ignore
    }
    try {
      return window.getSelection()?.toString()?.trim() ?? "";
    } catch {
      return "";
    }
  }

  if (loadError) {
    return <div className="errorText">{loadError}</div>;
  }

  if (!bookData) {
    return <div className="muted" style={{ padding: 12 }}>Preparing EPUB…</div>;
  }

  return (
    <div className="epubContainer">
      <ReactReader
        url={bookData}
        location={location}
        locationChanged={(loc: string) => {
          setLocation(loc);
          onLocationChanged?.(loc);
        }}
        handleKeyPress={(event: KeyboardEvent) => {
          // Replace react-reader's default key handling so we can debug and avoid crashes.
          // eslint-disable-next-line no-console
          console.log("[reader] keyup:", { key: event.key, code: event.code, keyCode: event.keyCode });

          const r = renditionRef.current;
          if (!r) return;

          try {
            if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
              // eslint-disable-next-line no-console
              console.log("[reader] next() via key");
              setNavStatus("next() via key");
              void r.next();
            } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
              // eslint-disable-next-line no-console
              console.log("[reader] prev() via key");
              setNavStatus("prev() via key");
              void r.prev();
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[reader] key navigation failed:", e);
            setNavStatus(`key nav error: ${e instanceof Error ? e.message : String(e)}`);
            onRendererError?.(e instanceof Error ? e.message : "Key navigation failed.");
          }
        }}
        // Keep content scripts disabled by default for safety; some EPUBs may log sandbox warnings.
        // (We can revisit allowScriptedContent behind an explicit toggle if needed.)
        epubOptions={{ allowScriptedContent: false, allowPopups: false }}
        getRendition={(rendition: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = rendition as any;
          renditionRef.current = r;
          setRenditionReady(true);

          // eslint-disable-next-line no-console
          console.log("[reader] rendition ready", {
            hasAnnotations: Boolean(r?.annotations),
            hasManager: Boolean(r?.manager),
            keys: Object.keys(r ?? {}).slice(0, 30),
          });

          try {
            r.on?.("relocated", (loc: unknown) => {
              // eslint-disable-next-line no-console
              console.log("[reader] relocated", loc);
            });
            r.on?.("rendered", (section: unknown) => {
              // eslint-disable-next-line no-console
              console.log("[reader] rendered", section);
            });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log("[reader] could not attach rendition debug events", e);
          }

          try {
            r.themes?.default?.({
              ".sp-local-highlight": {
                "background-color": "rgba(255, 235, 59, 0.55)",
              },
            });
          } catch {
            // ignore theme issues in spike
          }

          try {
            // Attach a single selection handler per rendition instance.
            if (handlerAttachedToRef.current !== r) {
              // Detach from previous rendition (if any) using the stored handler reference.
              if (handlerAttachedToRef.current && selectedHandlerRef.current && handlerAttachedToRef.current.off) {
                try {
                  handlerAttachedToRef.current.off("selected", selectedHandlerRef.current);
                } catch {
                  // ignore
                }
              }

              const handler = async (cfiRange: string) => {
              try {
                if (highlightByCfiRef.current.has(cfiRange)) {
                  // prevent duplicates
                  try {
                    window.getSelection()?.removeAllRanges();
                  } catch {
                    // ignore
                  }
                  return;
                }
                const text = await extractSelectedText(cfiRange);
                const highlight: LocalHighlight = {
                  id: createHighlightId(),
                  cfiRange,
                  text: text || "(no text captured)",
                  color: "yellow",
                  createdAt: new Date().toISOString(),
                };

                // Render immediately (and parent will also re-render via state update).
                r.annotations.highlight(
                  highlight.cfiRange,
                  { id: highlight.id },
                  () => onHighlightClicked?.(highlight.id),
                  "sp-local-highlight",
                );
                renderedCfisRef.current.add(highlight.cfiRange);

                try {
                  window.getSelection()?.removeAllRanges();
                } catch {
                  // ignore
                }
                onHighlightCreated?.(highlight);
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error("Selection/highlight failed:", err);
                onRendererError?.(err instanceof Error ? err.message : "Selection/highlight failed.");
              }
              };

              selectedHandlerRef.current = handler;
              handlerAttachedToRef.current = r;
              r.on?.("selected", handler);
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Failed to attach selection handler:", e);
            onRendererError?.(e instanceof Error ? e.message : "Failed to attach selection handler.");
          }

          // Ensure existing highlights are rendered once rendition is ready.
          try {
            for (const h of highlights) {
              r.annotations.highlight(
                h.cfiRange,
                { id: h.id },
                () => onHighlightClicked?.(h.id),
                "sp-local-highlight",
              );
              renderedCfisRef.current.add(h.cfiRange);
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Initial highlight render failed:", e);
          }
        }}
        loadingView={<div className="muted" style={{ padding: 12 }}>Loading EPUB…</div>}
        errorView={
          <div className="errorText" style={{ padding: 12 }}>
            Error loading book. See diagnostics above.
          </div>
        }
      />
      {renditionReady ? (
        <div style={{ padding: 8, borderTop: "1px solid rgba(17, 24, 39, 0.12)" }}>
          <span className="muted">Navigation debug:</span>{" "}
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => {
              const r = renditionRef.current;
              // eslint-disable-next-line no-console
              console.log("[reader] prev() clicked", { hasRendition: Boolean(r), hasManager: Boolean(r?.manager) });
              setNavStatus("prev() clicked");
              try {
                const p = r?.prev?.();
                // eslint-disable-next-line no-console
                console.log("[reader] prev() return", p);
                void Promise.resolve(p).catch((e) => {
                  // eslint-disable-next-line no-console
                  console.error("[reader] prev() promise rejected", e);
                  setNavStatus(`prev() rejected: ${e instanceof Error ? e.message : String(e)}`);
                });
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error("[reader] prev() failed", e);
                setNavStatus(`prev() error: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          >
            Prev
          </button>{" "}
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => {
              const r = renditionRef.current;
              // eslint-disable-next-line no-console
              console.log("[reader] next() clicked", { hasRendition: Boolean(r), hasManager: Boolean(r?.manager) });
              setNavStatus("next() clicked");
              try {
                const p = r?.next?.();
                // eslint-disable-next-line no-console
                console.log("[reader] next() return", p);
                void Promise.resolve(p).catch((e) => {
                  // eslint-disable-next-line no-console
                  console.error("[reader] next() promise rejected", e);
                  setNavStatus(`next() rejected: ${e instanceof Error ? e.message : String(e)}`);
                });
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error("[reader] next() failed", e);
                setNavStatus(`next() error: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          >
            Next
          </button>
          <div className="muted" style={{ marginTop: 6 }}>
            nav status: <span className="mono">{navStatus}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
