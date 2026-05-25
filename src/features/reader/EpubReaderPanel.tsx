import { useEffect, useMemo, useRef, useState } from "react";
import { ReactReader } from "react-reader";
import type { LocalHighlight, PendingSelection, ReaderLocation } from "./types";
import type { ReaderSettings } from "../../storage/readerSettings";
import { DEFAULT_HIGHLIGHT_COLOR, highlightColorToClassName, isHighlightColor } from "./highlightColors";

// Renderer implementation: keep react-reader/epubjs usage isolated here.
// TODO: Move renderer interactions behind ReaderBridge before adding more reader features.

function highlightStylesForToken(token: string): Record<string, string> {
  // epub.js highlights are rendered via SVG shapes; CSS background-color won't apply.
  // Provide explicit SVG-friendly style values derived from the allowed semantic tokens.
  switch (token) {
    case "green":
      return { fill: "rgb(34, 197, 94)", "fill-opacity": "0.32" };
    case "blue":
      return { fill: "rgb(59, 130, 246)", "fill-opacity": "0.30" };
    case "pink":
      return { fill: "rgb(236, 72, 153)", "fill-opacity": "0.26" };
    case "purple":
      return { fill: "rgb(168, 85, 247)", "fill-opacity": "0.26" };
    case "orange":
      return { fill: "rgb(249, 115, 22)", "fill-opacity": "0.28" };
    case "yellow":
    default:
      return { fill: "rgb(255, 235, 59)", "fill-opacity": "0.40" };
  }
}

function highlightClassForToken(token: string): string {
  // epub.js passes this through to `classList.add(className)` so it must be a single token (no spaces).
  const safeToken = isHighlightColor(token) ? token : DEFAULT_HIGHLIGHT_COLOR;
  return `spHl_${highlightColorToClassName(safeToken)}`;
}

export function EpubReaderPanel({
  blob,
  highlights,
  initialLocation,
  goToStartSignal,
  settings,
  onLocationChanged,
  onReaderLocationChange,
  onHighlightClicked,
  onTextSelected,
  onRendererError,
}: {
  blob: Blob;
  highlights: LocalHighlight[];
  initialLocation?: string | number;
  goToStartSignal?: number;
  settings?: ReaderSettings;
  onLocationChanged?: (location: string) => void;
  onReaderLocationChange?: (loc: ReaderLocation) => void;
  onHighlightClicked?: (highlightId: string) => void;
  onTextSelected?: (selection: PendingSelection) => void;
  onRendererError?: (message: string) => void;
}) {
  const DEBUG_READER = import.meta.env.DEV;
  const [location, setLocation] = useState<string | number | null>(null);
  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renditionVersion, setRenditionVersion] = useState(0);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const themesAttachedToRef = useRef<any | null>(null);
  const themesRegisteredRef = useRef(false);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !settings) return;

    try {
      if (!themesRegisteredRef.current || themesAttachedToRef.current !== rendition) {
        themesAttachedToRef.current = rendition;
        themesRegisteredRef.current = true;

        // Register simple themes once per rendition instance.
        rendition.themes.register("sp-light", {
          body: { background: "#ffffff", color: "#111111" },
          a: { color: "#0b57d0" },
        });
        rendition.themes.register("sp-sepia", {
          body: { background: "#f4ecd8", color: "#3b2f1c" },
          a: { color: "#1f5faa" },
        });
        rendition.themes.register("sp-dark", {
          body: { background: "#111111", color: "#f2f2f2" },
          a: { color: "#8ab4f8" },
        });
      }

      if (typeof settings.fontSizePercent === "number" && Number.isFinite(settings.fontSizePercent)) {
        rendition.themes.fontSize(`${settings.fontSizePercent}%`);
      }

      const themeName =
        settings.theme === "dark" ? "sp-dark" : settings.theme === "sepia" ? "sp-sepia" : "sp-light";
      rendition.themes.select(themeName);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[reader] failed to apply reader settings:", e);
    }
  }, [renditionVersion, settings?.fontSizePercent, settings?.theme]);

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
    renderedCfisRef.current = new Set();
    locationsInitStartedRef.current = false;
    locationsInitForRef.current = null;
    if (DEBUG_READER) {
      // eslint-disable-next-line no-console
      console.log("[reader] loading new EPUB blob");
    }

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

  useEffect(() => {
    if (!goToStartSignal) return;
    // Best-effort: drive via state (react-reader) and via rendition (epub.js) if available.
    setLocation(0);
    const r = renditionRef.current;
    try {
      if (r?.display) void r.display(0);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[reader] goToStart failed:", e);
    }
  }, [goToStartSignal]);

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
        const token = isHighlightColor(h.color) ? h.color : DEFAULT_HIGHLIGHT_COLOR;
        rendition.annotations.highlight(
          h.cfiRange,
          { id: h.id },
          () => onHighlightClicked?.(h.id),
          highlightClassForToken(token),
          highlightStylesForToken(token),
        );
        rendered.add(h.cfiRange);
      }

      if (DEBUG_READER) {
        // eslint-disable-next-line no-console
        console.log("[reader] highlight reconcile", { highlights: highlights.length, rendered: rendered.size });
      }
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
    return <div className="muted" style={{ padding: 12 }}>Preparing EPUB...</div>;
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
          if (DEBUG_READER) {
            // eslint-disable-next-line no-console
            console.log("[reader] keyup:", { key: event.key, code: event.code, keyCode: event.keyCode });
          }

          const r = renditionRef.current;
          if (!r) return;

          try {
            if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
              void r.next();
            } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
              void r.prev();
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[reader] key navigation failed:", e);
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
          renderedCfisRef.current = new Set();
          setRenditionVersion((v) => v + 1);

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
              if (DEBUG_READER) {
                // eslint-disable-next-line no-console
                console.log("[reader] rendered", section);
              }
            });
          } catch (e) {
            if (DEBUG_READER) {
              // eslint-disable-next-line no-console
              console.log("[reader] could not attach rendition events", e);
            }
          }

          // Kick off locations generation once per opened book (enables percentageFromCfi / progression).
          try {
            if (!locationsInitStartedRef.current && bookData && locationsInitForRef.current !== bookData) {
              locationsInitStartedRef.current = true;
              locationsInitForRef.current = bookData;
              const gen = r?.book?.locations?.generate;
              if (typeof gen === "function") {
                if (DEBUG_READER) {
                  // eslint-disable-next-line no-console
                  console.log("[reader] generating locations for progression...");
                }
                void Promise.resolve(gen.call(r.book.locations, 1600))
                  .then(() => {
                    if (DEBUG_READER) {
                      // eslint-disable-next-line no-console
                      console.log("[reader] locations generated");
                    }

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
              // These selectors are a fallback only; epub.js highlights are SVG so we primarily color via style.
              ".spHl_highlightColorYellow": { "border-radius": "2px" },
              ".spHl_highlightColorGreen": { "border-radius": "2px" },
              ".spHl_highlightColorBlue": { "border-radius": "2px" },
              ".spHl_highlightColorPink": { "border-radius": "2px" },
              ".spHl_highlightColorPurple": { "border-radius": "2px" },
              ".spHl_highlightColorOrange": { "border-radius": "2px" },
            });
          } catch {
            // ignore theme issues
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
              const token = isHighlightColor(h.color) ? h.color : DEFAULT_HIGHLIGHT_COLOR;
              r.annotations.highlight(
                h.cfiRange,
                { id: h.id },
                () => onHighlightClicked?.(h.id),
                highlightClassForToken(token),
                highlightStylesForToken(token),
              );
              renderedCfisRef.current.add(h.cfiRange);
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Initial highlight render failed:", e);
          }
        }}
        loadingView={<div className="muted" style={{ padding: 12 }}>Loading EPUB...</div>}
        errorView={
          <div className="errorText" style={{ padding: 12 }}>
            Error loading book.
          </div>
        }
      />
    </div>
  );
}
