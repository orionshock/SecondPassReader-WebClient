import { useEffect, useMemo, useRef, useState } from "react";
import { ReactReader } from "react-reader";
import type { LocalHighlight, PendingSelection, ReaderLocation } from "./types";

// Renderer spike: keep react-reader usage isolated here.
// TODO: Move renderer interactions behind ReaderBridge before adding annotations/sessions.

export function EpubReaderPanel({
  blob,
  highlights,
  initialLocation,
  onLocationChanged,
  onReaderLocationChange,
  onHighlightClicked,
  onTextSelected,
  onRendererError,
}: {
  blob: Blob;
  highlights: LocalHighlight[];
  initialLocation?: string | number;
  onLocationChanged?: (location: string) => void;
  onReaderLocationChange?: (loc: ReaderLocation) => void;
  onHighlightClicked?: (highlightId: string) => void;
  onTextSelected?: (selection: PendingSelection) => void;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relocatedHandlerRef = useRef<((loc: any) => void) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relocatedAttachedToRef = useRef<any | null>(null);
  const renderedCfisRef = useRef<Set<string>>(new Set());
  const highlightByCfiRef = useRef<Map<string, LocalHighlight>>(new Map());
  const locationsInitForRef = useRef<ArrayBuffer | null>(null);
  const locationsInitStartedRef = useRef(false);
  const lastRelocatedRef = useRef<unknown>(null);

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
    renderedCfisRef.current = new Set();
    locationsInitStartedRef.current = false;
    locationsInitForRef.current = null;
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

  useEffect(() => {
    if (initialLocation === undefined || initialLocation === null) return;
    setLocation((prev) => (prev === null ? initialLocation : prev));
  }, [initialLocation]);

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

      // eslint-disable-next-line no-console
      console.log("[reader] highlight reconcile", { highlights: highlights.length, rendered: rendered.size });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Highlight reconcile failed:", e);
      onRendererError?.(e instanceof Error ? e.message : "Highlight reconcile failed.");
    }
  }, [highlights, highlightIndex, onHighlightClicked, onRendererError]);

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
          renderedCfisRef.current = new Set();

          // eslint-disable-next-line no-console
          console.log("[reader] rendition ready", {
            hasAnnotations: Boolean(r?.annotations),
            hasManager: Boolean(r?.manager),
            keys: Object.keys(r ?? {}).slice(0, 30),
          });

          try {
            // Attach a single relocated handler per rendition instance.
            if (relocatedAttachedToRef.current !== r) {
              if (relocatedAttachedToRef.current && relocatedHandlerRef.current && relocatedAttachedToRef.current.off) {
                try {
                  relocatedAttachedToRef.current.off("relocated", relocatedHandlerRef.current);
                } catch {
                  // ignore
                }
              }

              const relocatedHandler = (loc: any) => {
                try {
                  lastRelocatedRef.current = loc;
                  const start = loc?.start ?? loc?.location?.start ?? null;
                  const displayed = start?.displayed ?? null;

                  // Best-effort progression:
                  // - Prefer epub.js relocated `start.percentage` when present
                  // - If stuck at 0/undefined, try percentageFromCfi(cfi) (requires locations to be generated)
                  let progression: number | undefined =
                    typeof start?.percentage === "number" && Number.isFinite(start.percentage) ? start.percentage : undefined;

                  const cfi = typeof start?.cfi === "string" ? start.cfi : undefined;

                  if ((progression === undefined || progression === 0) && cfi) {
                    try {
                      const pctFn = r?.book?.locations?.percentageFromCfi;
                      if (typeof pctFn === "function") {
                        const computed = pctFn.call(r.book.locations, cfi);
                        if (typeof computed === "number" && Number.isFinite(computed)) progression = computed;
                      }
                    } catch {
                      // ignore
                    }
                  }

                  const readerLoc: ReaderLocation = {
                    cfi,
                    href: typeof start?.href === "string" ? start.href : undefined,
                    progression,
                    displayedPage: typeof displayed?.page === "number" ? displayed.page : undefined,
                    displayedTotal: typeof displayed?.total === "number" ? displayed.total : undefined,
                    raw: loc,
                  };
                  onReaderLocationChange?.(readerLoc);
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error("[reader] relocated handler failed:", e);
                }
              };

              relocatedHandlerRef.current = relocatedHandler;
              relocatedAttachedToRef.current = r;
              r.on?.("relocated", relocatedHandler);
            }

            // Optional render debug; harmless.
            r.on?.("rendered", (section: unknown) => {
              // eslint-disable-next-line no-console
              console.log("[reader] rendered", section);
            });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log("[reader] could not attach rendition events", e);
          }

          // Kick off locations generation once per opened book (enables percentageFromCfi / progression).
          try {
            if (!locationsInitStartedRef.current && bookData && locationsInitForRef.current !== bookData) {
              locationsInitStartedRef.current = true;
              locationsInitForRef.current = bookData;
              const gen = r?.book?.locations?.generate;
              if (typeof gen === "function") {
                // eslint-disable-next-line no-console
                console.log("[reader] generating locations for progression...");
                void Promise.resolve(gen.call(r.book.locations, 1600))
                  .then(() => {
                    // eslint-disable-next-line no-console
                    console.log("[reader] locations generated");

                    // After locations are generated, re-emit the current location so progression updates immediately
                    // (otherwise it won't change until the next navigation triggers relocated).
                    try {
                      const currentLocObj =
                        (typeof r?.currentLocation === "function" ? r.currentLocation() : null) ??
                        (r?.location ? r.location : null) ??
                        lastRelocatedRef.current;

                      const start =
                        // currentLocation() returns { start, end } in many epub.js versions
                        // but we also tolerate nested shapes seen in some wrappers.
                        (currentLocObj as any)?.start ?? (currentLocObj as any)?.location?.start ?? null;
                      const cfi = typeof start?.cfi === "string" ? start.cfi : typeof location === "string" ? location : undefined;
                      const href = typeof start?.href === "string" ? start.href : undefined;
                      const displayed = start?.displayed ?? null;

                      let progression: number | undefined = undefined;
                      try {
                        const pctFn = r?.book?.locations?.percentageFromCfi;
                        if (cfi && typeof pctFn === "function") {
                          const computed = pctFn.call(r.book.locations, cfi);
                          if (typeof computed === "number" && Number.isFinite(computed)) progression = computed;
                        }
                      } catch {
                        // ignore
                      }

                      if (cfi || href || progression !== undefined) {
                        onReaderLocationChange?.({
                          cfi,
                          href,
                          progression,
                          displayedPage: typeof displayed?.page === "number" ? displayed.page : undefined,
                          displayedTotal: typeof displayed?.total === "number" ? displayed.total : undefined,
                          raw: currentLocObj,
                        });
                      }
                    } catch (e) {
                      // eslint-disable-next-line no-console
                      console.warn("[reader] post-generate location emit failed:", e);
                    }
                  })
                  .catch((err: unknown) => {
                    // eslint-disable-next-line no-console
                    console.warn("[reader] locations generation failed:", err);
                  });
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("[reader] locations init error:", e);
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
                const selection: PendingSelection = {
                  cfiRange,
                  text: text || "(no text captured)",
                  createdAt: new Date().toISOString(),
                };

                onTextSelected?.(selection);
                try {
                  window.getSelection()?.removeAllRanges();
                } catch {
                  // ignore
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error("Selection/highlight failed:", err);
                onRendererError?.(err instanceof Error ? err.message : "Selection capture failed.");
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
