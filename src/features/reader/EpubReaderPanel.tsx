import { useEffect, useMemo, useRef, useState } from "react";
import { ReactReader } from "react-reader";
import type { LocalHighlight, PendingSelection, ReaderLocation } from "./types";
import type { ReaderSettings } from "../../storage/readerSettings";
import { DEFAULT_HIGHLIGHT_COLOR, highlightColorToClassName, isHighlightColor } from "./highlightColors";

// Renderer implementation: keep react-reader/epubjs usage isolated here.
// TODO: Move renderer interactions behind ReaderBridge before adding more reader features.

function highlightStylesForToken(token: string, opts?: { readOnly?: boolean }): Record<string, string> {
  // epub.js highlights are rendered via SVG shapes; CSS background-color won't apply.
  // Provide explicit SVG-friendly style values derived from the allowed semantic tokens.
  const ro = Boolean(opts?.readOnly);
  const fillOpacity = ro ? "0.18" : undefined;
  const strokeOpacity = ro ? "0.35" : undefined;
  switch (token) {
    case "green":
      return { fill: "rgb(34, 197, 94)", "fill-opacity": fillOpacity ?? "0.32", stroke: "rgb(34, 197, 94)", "stroke-opacity": strokeOpacity ?? "0" };
    case "blue":
      return { fill: "rgb(59, 130, 246)", "fill-opacity": fillOpacity ?? "0.30", stroke: "rgb(59, 130, 246)", "stroke-opacity": strokeOpacity ?? "0" };
    case "pink":
      return { fill: "rgb(236, 72, 153)", "fill-opacity": fillOpacity ?? "0.26", stroke: "rgb(236, 72, 153)", "stroke-opacity": strokeOpacity ?? "0" };
    case "purple":
      return { fill: "rgb(168, 85, 247)", "fill-opacity": fillOpacity ?? "0.26", stroke: "rgb(168, 85, 247)", "stroke-opacity": strokeOpacity ?? "0" };
    case "orange":
      return { fill: "rgb(249, 115, 22)", "fill-opacity": fillOpacity ?? "0.28", stroke: "rgb(249, 115, 22)", "stroke-opacity": strokeOpacity ?? "0" };
    case "yellow":
    default:
      return { fill: "rgb(255, 235, 59)", "fill-opacity": fillOpacity ?? "0.40", stroke: "rgb(255, 235, 59)", "stroke-opacity": strokeOpacity ?? "0" };
  }
}

function highlightClassForToken(token: string, opts?: { readOnly?: boolean }): string {
  // epub.js passes this through to `classList.add(className)` so it must be a single token (no spaces).
  const safeToken = isHighlightColor(token) ? token : DEFAULT_HIGHLIGHT_COLOR;
  const prefix = opts?.readOnly ? "spPrevHl" : "spHl";
  return `${prefix}_${highlightColorToClassName(safeToken)}`;
}

export function EpubReaderPanel({
  blob,
  highlights,
  bookmarks,
  initialLocation,
  goToStartSignal,
  settings,
  onLocationChanged,
  onReaderLocationChange,
  onHighlightClicked,
  onTextSelected,
  onRendererError,
  onVisibleBookmarksChange,
}: {
  blob: Blob;
  highlights: LocalHighlight[];
  bookmarks?: Array<{ id: string; cfi: string }>;
  initialLocation?: string | number;
  goToStartSignal?: number;
  settings?: ReaderSettings;
  onLocationChanged?: (location: string) => void;
  onReaderLocationChange?: (loc: ReaderLocation) => void;
  onHighlightClicked?: (highlightId: string) => void;
  onTextSelected?: (selection: PendingSelection) => void;
  onRendererError?: (message: string) => void;
  onVisibleBookmarksChange?: (visibleIds: string[]) => void;
}) {
  const DEBUG_READER = import.meta.env.DEV;
  const [location, setLocation] = useState<string | number | null>(null);
  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renditionVersion, setRenditionVersion] = useState(0);
  const [highlightReflowSignal, setHighlightReflowSignal] = useState(0);
  const pendingHighlightReflowRef = useRef(false);
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
  // Track which CFIs are rendered and with what "signature" so we can re-render when color/readOnly changes.
  const renderedCfisRef = useRef<Map<string, string>>(new Map());
  const highlightByCfiRef = useRef<Map<string, LocalHighlight>>(new Map());
  const locationsInitForRef = useRef<ArrayBuffer | null>(null);
  const locationsInitStartedRef = useRef(false);
  const lastRelocatedRef = useRef<unknown>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const themesAttachedToRef = useRef<any | null>(null);
  const themesRegisteredRef = useRef(false);
  const visibleBookmarksKeyRef = useRef<string>("");

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

      const lineHeight =
        settings.lineHeight === "compact"
          ? "1.25"
          : settings.lineHeight === "relaxed"
            ? "1.65"
            : settings.lineHeight === "loose"
              ? "1.85"
              : "1.45";

      const pageMargin = settings.pageMargin === "compact" ? "5%" : settings.pageMargin === "wide" ? "12%" : "8%";

      const serifStack = `Georgia, "Times New Roman", serif`;
      const sansStack = `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const fontFamily =
        settings.fontFamily === "serif" ? serifStack : settings.fontFamily === "sans" ? sansStack : undefined;

      // Apply typography/padding inside the EPUB iframe. Avoid overriding publisher fonts when set to "publisher".
      const baseBody: Record<string, string> = {
        "line-height": lineHeight,
        "padding-left": pageMargin,
        "padding-right": pageMargin,
      };
      if (fontFamily) baseBody["font-family"] = fontFamily;

      rendition.themes.default({
        body: baseBody,
      });

      const themeName =
        settings.theme === "dark" ? "sp-dark" : settings.theme === "sepia" ? "sp-sepia" : "sp-light";
      rendition.themes.select(themeName);

      // Changing typography/margins can shift text layout; force highlight overlays to be re-injected
      // so they realign to the new DOM geometry.
      try {
        const rendered = renderedCfisRef.current;
        for (const cfi of Array.from(rendered.keys())) {
          rendition.annotations.remove(cfi, "highlight");
        }
        rendered.clear();
      } catch {
        // ignore highlight reflow issues; reconcile effect will retry.
      }
      pendingHighlightReflowRef.current = true;
      // Fallback: if epub.js doesn't emit relocated for this change, reflow anyway shortly after.
      window.setTimeout(() => {
        if (!pendingHighlightReflowRef.current) return;
        pendingHighlightReflowRef.current = false;
        setHighlightReflowSignal((v) => v + 1);
      }, 150);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[reader] failed to apply reader settings:", e);
    }
  }, [
    renditionVersion,
    settings?.fontSizePercent,
    settings?.theme,
    settings?.lineHeight,
    settings?.fontFamily,
    settings?.pageMargin,
  ]);

  const highlightIndex = useMemo(() => {
    const byCfi = new Map<string, LocalHighlight>();
    for (const h of highlights) byCfi.set(h.cfiRange, h);
    return byCfi;
  }, [highlights]);

  useEffect(() => {
    highlightByCfiRef.current = highlightIndex;
  }, [highlightIndex]);

  useEffect(() => {
    if (!onVisibleBookmarksChange) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const r = renditionRef.current;
        const list = bookmarks ?? [];

        if (!r || list.length === 0) {
          if (!cancelled && visibleBookmarksKeyRef.current !== "") {
            visibleBookmarksKeyRef.current = "";
            onVisibleBookmarksChange([]);
          }
          return;
        }

        const contentsRaw = typeof r?.getContents === "function" ? r.getContents() : [];
        const contents = Array.isArray(contentsRaw) ? contentsRaw : contentsRaw ? [contentsRaw] : [];
        if (contents.length === 0) {
          if (!cancelled && visibleBookmarksKeyRef.current !== "") {
            visibleBookmarksKeyRef.current = "";
            onVisibleBookmarksChange([]);
          }
          return;
        }

        const visible: string[] = [];

        for (const bm of list) {
          const cfi = (bm?.cfi ?? "").trim();
          if (!cfi) continue;

          let isVisible = false;
          for (const c of contents) {
            if (!c) continue;
            const iframe: HTMLElement | null = c?.iframe ?? (c?.window?.frameElement as any) ?? null;
            if (!iframe || typeof iframe.getBoundingClientRect !== "function") continue;
            const iframeRect = iframe.getBoundingClientRect();

            let range: Range | null = null;
            try {
              if (typeof c?.range === "function") range = c.range(cfi) as Range;
              else if (typeof r?.getRange === "function") range = r.getRange(cfi) as Range;
            } catch {
              range = null;
            }
            if (!range) continue;

            // Ensure the resolved range is from this rendered document.
            const doc = c?.document ?? c?.window?.document ?? null;
            const owner = (range.startContainer as any)?.ownerDocument ?? null;
            if (doc && owner && owner !== doc) continue;

            let rect: DOMRect | null = null;
            try {
              const rects = typeof (range as any).getClientRects === "function" ? (range as any).getClientRects() : null;
              if (rects && rects.length) rect = rects[0] as DOMRect;
              else if (typeof range.getBoundingClientRect === "function") rect = range.getBoundingClientRect();
            } catch {
              rect = null;
            }
            if (!rect) continue;
            if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) continue;
            if (rect.width === 0 && rect.height === 0) continue;

            const absLeft = iframeRect.left + rect.left;
            const absTop = iframeRect.top + rect.top;
            const absRight = absLeft + rect.width;
            const absBottom = absTop + rect.height;

            const intersects =
              absRight > iframeRect.left &&
              absLeft < iframeRect.right &&
              absBottom > iframeRect.top &&
              absTop < iframeRect.bottom;

            if (intersects) {
              isVisible = true;
              break;
            }
          }

          // Fallback: if CFI-to-range resolution isn't working in this renderer/version,
          // fall back to exact CFI string matching against the current location.
          if (!isVisible && typeof location === "string" && location.trim() && location.trim() === cfi) {
            isVisible = true;
          }

          if (isVisible) visible.push(bm.id);
          if (cancelled) return;
        }

        const key = visible.join("|");
        if (!cancelled && visibleBookmarksKeyRef.current !== key) {
          visibleBookmarksKeyRef.current = key;
          onVisibleBookmarksChange(visible);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookmarks, location, onVisibleBookmarksChange, renditionVersion]);

  useEffect(() => {
    let cancelled = false;
    setBookData(null);
    setLoadError(null);
    setLocation(null);
    renditionRef.current = null;
    renderedCfisRef.current = new Map();
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
      const next = new Map<string, string>();
      for (const h of highlights) {
        const token = isHighlightColor(h.color) ? h.color : DEFAULT_HIGHLIGHT_COLOR;
        next.set(h.cfiRange, `${token}|${h.readOnly ? "ro" : "rw"}`);
      }

      // Remove any previously-rendered highlights that no longer exist.
      for (const [cfi, sig] of Array.from(rendered.entries())) {
        if (next.get(cfi) !== sig) {
          rendition.annotations.remove(cfi, "highlight");
          rendered.delete(cfi);
        }
      }

      // Add new highlights or re-render changed ones.
      for (const h of highlights) {
        const token = isHighlightColor(h.color) ? h.color : DEFAULT_HIGHLIGHT_COLOR;
        const sig = `${token}|${h.readOnly ? "ro" : "rw"}`;
        if (rendered.get(h.cfiRange) === sig) continue;
        rendition.annotations.highlight(
          h.cfiRange,
          { id: h.id },
          h.readOnly ? undefined : () => onHighlightClicked?.(h.id),
          highlightClassForToken(token, { readOnly: h.readOnly }),
          highlightStylesForToken(token, { readOnly: h.readOnly }),
        );
        rendered.set(h.cfiRange, sig);
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
  }, [highlights, highlightIndex, highlightReflowSignal, onHighlightClicked, onRendererError]);

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
          renderedCfisRef.current = new Map();
          setRenditionVersion((v) => v + 1);

          if (DEBUG_READER) {
            // eslint-disable-next-line no-console
            console.log("[reader] rendition ready", {
              hasAnnotations: Boolean(r?.annotations),
              hasManager: Boolean(r?.manager),
              keys: Object.keys(r ?? {}).slice(0, 30),
            });
          }

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

                  if (pendingHighlightReflowRef.current) {
                    pendingHighlightReflowRef.current = false;
                    setHighlightReflowSignal((v) => v + 1);
                  }
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
                const anchor = tryGetSelectionAnchorFromRendition(r);
                const selection: PendingSelection = {
                  cfiRange,
                  text: text || "(no text captured)",
                  createdAt: new Date().toISOString(),
                  anchor,
                };

                onTextSelected?.(selection);
                try {
                  // Clear selection in the iframe document (preferred) and in the outer window (best-effort).
                  try {
                    for (const c of (typeof r?.getContents === "function" ? r.getContents() : []) ?? []) {
                      const w = c?.window ?? c?.document?.defaultView ?? null;
                      w?.getSelection?.()?.removeAllRanges?.();
                    }
                  } catch {
                    // ignore
                  }
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
              const sig = `${token}|${h.readOnly ? "ro" : "rw"}`;
              r.annotations.highlight(
                h.cfiRange,
                { id: h.id },
                h.readOnly ? undefined : () => onHighlightClicked?.(h.id),
                highlightClassForToken(token, { readOnly: h.readOnly }),
                highlightStylesForToken(token, { readOnly: h.readOnly }),
              );
              renderedCfisRef.current.set(h.cfiRange, sig);
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

function tryGetSelectionAnchorFromRendition(rendition: any): { x: number; y: number } | undefined {
  try {
    const contents = typeof rendition?.getContents === "function" ? rendition.getContents() : [];
    if (!Array.isArray(contents)) return undefined;

    for (const c of contents) {
      const win = c?.window ?? c?.document?.defaultView ?? null;
      if (!win || typeof win.getSelection !== "function") continue;
      const sel = win.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) continue;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect?.();
      if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) continue;

      const iframe: HTMLElement | null = c?.iframe ?? (win.frameElement as any) ?? null;
      if (!iframe || typeof iframe.getBoundingClientRect !== "function") continue;
      const iframeRect = iframe.getBoundingClientRect();

      const x = iframeRect.left + rect.left + rect.width / 2;
      const y = iframeRect.top + rect.top;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      return { x, y };
    }
  } catch {
    // ignore
  }
  return undefined;
}
