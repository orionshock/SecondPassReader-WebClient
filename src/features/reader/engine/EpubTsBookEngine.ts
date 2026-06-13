import ePub, { EpubCFI, type Book, type Location, type Rendition } from "@likecoin/epub-ts";
import { normalizeReaderSettings, type ReaderSettings } from "../../../storage/readerSettings";
import type { ReaderLocation, ReaderLocationTarget } from "../domain/types";
import type { ReaderTocItem } from "../domain/types";
import type { ReaderLocationDescription } from "../domain/types";
import type { ReaderSelection } from "../domain/types";
import { buildQuoteContext } from "../selection/quoteContext";
import type { ReaderHighlightMark, ReaderSearchOptions, ReaderSearchResult } from "../domain/types";
import { createHighlightMarkPainter } from "./highlightMarks";
import { normalizeLocation, normalizeTocItems, toRenditionTarget } from "./epubLocationUtils";
import { extractSelectionTextAndContext } from "./selectionExtraction";
import { searchEpubTsBook } from "./EpubTsBookSearch";
import {
  getReaderEpubDisplayRules,
  getReaderEpubThemeRules,
  getReaderFontFamilyCssValue,
  getReaderLineHeightCssValue,
} from "../settings/readerDisplaySettings";

export type EpubTsBookEngineSource = string | ArrayBuffer | Blob;

export type EpubTsBookEngineInit = {
  source: EpubTsBookEngineSource;
  mountEl: HTMLElement;
  onLocationChanged?: (location: ReaderLocation) => void;
  onTocReady?: (toc: ReaderTocItem[]) => void;
  onLocationsReady?: () => void;
  onSelectionChanged?: (selection: ReaderSelection | null) => void;
  onError?: (error: unknown) => void;
  /**
   * Enables background locations generation for approximate whole-book percentages.
   * Some epub-ts builds/books throw unhandled errors during generation; keep opt-in.
   */
  enableLocationsGeneration?: boolean;
  displaySettings?: ReaderSettings;
};

export type EpubTsBookEngine = {
  display(target?: ReaderLocationTarget): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  clearSelection(): void;
  applyDisplaySettings(settings: ReaderSettings): Promise<void>;
  resizeToMount(): Promise<void>;
  setHighlightMarks(marks: ReaderHighlightMark[]): void;
  describeCfi(cfi: string): Promise<ReaderLocationDescription>;
  searchBook(query: string, options?: ReaderSearchOptions): Promise<ReaderSearchResult[]>;
  destroy(): void;
};

export async function createEpubTsBookEngine(init: EpubTsBookEngineInit): Promise<EpubTsBookEngine> {
  const book: Book = ePub(init.source as any, { replacements: "blobUrl" });

  // Ensure parsing/opening completes before rendering.
  await book.opened;
  if (book.replacementsReady) await book.replacementsReady;

  const measureMount = (): { width: number; height: number } => {
    const rect = init.mountEl.getBoundingClientRect();
    const width = Math.floor(rect.width || init.mountEl.clientWidth || 0);
    const height = Math.floor(rect.height || init.mountEl.clientHeight || 0);
    return { width, height };
  };

  const waitForMountSize = async (): Promise<{ width: number; height: number }> => {
    // epub-ts Rendition#attachTo casts settings.width/height to numbers when
    // constructing the manager Stage. Passing "100%" ends up as NaN and breaks
    // pagination measurements, which in turn makes next/prev behave like section
    // jumps. Ensure we pass real pixel sizes.
    const start = Date.now();
    while (true) {
      const { width, height } = measureMount();
      if (width > 0 && height > 0) return { width, height };
      if (Date.now() - start > 1000) return { width: Math.max(width, 1), height: Math.max(height, 1) };
      await new Promise((r) => setTimeout(r, 16));
    }
  };

  let readerToc: ReaderTocItem[] = [];

  try {
    const nav = await book.loaded.navigation;
    const toc = normalizeTocItems(nav.toc as any);
    readerToc = toc;
    init.onTocReady?.(toc);
  } catch (err) {
    // TOC should not prevent reading; report as a non-fatal error.
    init.onError?.(err);
  }

  const { width, height } = await waitForMountSize();

  // Reader UX: treat next/prev as rendered page/spread navigation.
  // Configure paginated flow up-front so the manager/layout are created in paginated mode.
  const rendition: Rendition = book.renderTo(init.mountEl, {
    width,
    height,
    manager: "default",
    flow: "paginated",
    spread: "auto",
    minSpreadWidth: 900,
  });

  // Defensive: some environments may ignore initial options; re-assert after init.
  try {
    rendition.flow("paginated");
    rendition.spread("auto", 900);
  } catch {
    // continue
  }

  let destroyed = false;
  let locationsReady = false;
  let lastRelocatedLoc: Location | null = null;

  const registerReaderThemes = () => {
    rendition.themes.registerRules("light", getReaderEpubThemeRules("light"));
    rendition.themes.registerRules("sepia", getReaderEpubThemeRules("sepia"));
    rendition.themes.registerRules("dark", getReaderEpubThemeRules("dark"));
  };

  let lastAppliedDisplaySettingsKey = "";

  const getCurrentCfi = (): string | null => {
    try {
      const current = rendition.currentLocation();
      const cfi = current?.start?.cfi;
      if (typeof cfi === "string" && cfi.trim()) return cfi.trim();
    } catch {
      // ignore
    }
    const relocatedCfi = lastRelocatedLoc?.start?.cfi;
    return typeof relocatedCfi === "string" && relocatedCfi.trim() ? relocatedCfi.trim() : null;
  };

  const applyDisplaySettingsInternal = async (settings: ReaderSettings, options?: { reanchor?: boolean }) => {
    if (destroyed) return;
    const normalized = normalizeReaderSettings(settings);
    const key = JSON.stringify({
      theme: normalized.theme,
      fontFamily: normalized.fontFamily,
      fontSizePercent: normalized.fontSizePercent,
      lineHeight: normalized.lineHeight,
    });
    if (lastAppliedDisplaySettingsKey === key) return;

    const reanchorCfi = options?.reanchor ? getCurrentCfi() : null;
    const lineHeight = getReaderLineHeightCssValue(normalized.lineHeight);
    const fontFamily = getReaderFontFamilyCssValue(normalized.fontFamily);

    rendition.themes.registerRules("default", getReaderEpubDisplayRules(normalized));
    rendition.themes.select(normalized.theme);
    rendition.themes.fontSize(`${normalized.fontSizePercent}%`);
    rendition.themes.override("line-height", lineHeight, true);

    if (fontFamily) rendition.themes.font(fontFamily);
    else rendition.themes.removeOverride("font-family");

    lastAppliedDisplaySettingsKey = key;

    if (reanchorCfi && !destroyed) {
      await rendition.display(reanchorCfi);
    } else if (options?.reanchor && !destroyed) {
      try {
        await rendition.reportLocation();
      } catch {
        // Location may be unavailable before the first display.
      }
    }
  };

  registerReaderThemes();
  if (init.displaySettings) {
    try {
      await applyDisplaySettingsInternal(init.displaySettings, { reanchor: false });
    } catch (err) {
      init.onError?.(err);
    }
  }

  const onRelocated = (loc: Location) => {
    lastRelocatedLoc = loc;
    try {
      const bookProgress = (() => {
        try {
          if (!locationsReady) return undefined;
          const cfi = loc.start?.cfi;
          if (!cfi) return undefined;
          const p = book.locations.percentageFromCfi(cfi);
          return typeof p === "number" && Number.isFinite(p) ? p : undefined;
        } catch {
          return undefined;
        }
      })();
      init.onLocationChanged?.(normalizeLocation(loc, { bookProgress }));
    } catch (err) {
      init.onError?.(err);
    }
  };

  const onDisplayError = (err: Error) => {
    init.onError?.(err);
  };

  rendition.on("relocated", onRelocated);
  rendition.on("displayerror", onDisplayError);

  const onSelected = (cfiRange: string, contents: any) => {
    try {
      const ctx = extractSelectionTextAndContext(contents);
      if (!ctx) {
        init.onSelectionChanged?.(null);
        return;
      }
      const { prefix, suffix } = buildQuoteContext({ exact: ctx.text, before: ctx.before, after: ctx.after });
      const href = (() => {
        try {
          const idx = typeof contents?.sectionIndex === "number" ? contents.sectionIndex : undefined;
          if (typeof idx === "number") return book.spine.get(idx)?.href ?? undefined;
        } catch {
          // ignore
        }
        return undefined;
      })();

      init.onSelectionChanged?.({
        cfiRange: cfiRange.trim(),
        text: ctx.text,
        quotePrefix: prefix,
        quoteSuffix: suffix,
        href,
        anchor: ctx.anchor,
      });
    } catch (err) {
      init.onError?.(err);
    }
  };

  rendition.on("selected", onSelected);

  let locationsGeneratePromise: Promise<unknown> | null = null;

  // Start locations generation in the background. This enables approximate whole-book
  // percentage lookups (Location.percentage / percentageFromCfi) without needing to
  // jump the rendition to a given CFI.
  const startLocationsGeneration = () => {
    if (locationsGeneratePromise) return;
    try {
      locationsGeneratePromise = (async () => {
        try {
          await book.locations.generate(1000);
          if (destroyed) return;
          const hasLocations = typeof book.locations.length === "function" ? book.locations.length() > 0 : false;
           if (hasLocations) {
             locationsReady = true;
             init.onLocationsReady?.();
             // Refresh current location so book-level percentage can update without waiting for navigation.
             try {
               if (lastRelocatedLoc && !destroyed) onRelocated(lastRelocatedLoc);
             } catch {
               // ignore
             }
           }
        } catch (err: unknown) {
          if (destroyed) return;
          // Non-fatal: percentage labels should degrade gracefully.
          init.onError?.(err);
        }
      })();
    } catch (err) {
      // ignore
    }
  };

  if (init.enableLocationsGeneration) startLocationsGeneration();

  const highlightMarkPainter = createHighlightMarkPainter({ rendition, onError: init.onError });

  return {
    async display(target?: ReaderLocationTarget) {
      if (destroyed) return;
      await rendition.display(toRenditionTarget(target));
    },
    async next() {
      if (destroyed) return;
      await rendition.next();
    },
    async previous() {
      if (destroyed) return;
      await rendition.prev();
    },
    clearSelection() {
      if (destroyed) return;
      try {
        for (const c of rendition.getContents()) {
          try {
            c.window?.getSelection?.()?.removeAllRanges?.();
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      try {
        init.onSelectionChanged?.(null);
      } catch {
        // ignore
      }
    },
    async applyDisplaySettings(settings: ReaderSettings) {
      if (destroyed) return;
      await applyDisplaySettingsInternal(settings, { reanchor: true });
    },
    async resizeToMount() {
      if (destroyed) return;
      const { width, height } = measureMount();
      if (width <= 0 || height <= 0) return;
      const cfi = getCurrentCfi();
      rendition.resize(width, height, cfi ?? undefined);
      if (cfi && !destroyed) await rendition.display(cfi);
      else if (!destroyed) await rendition.reportLocation();
    },
    setHighlightMarks(marks: ReaderHighlightMark[]) {
      if (destroyed) return;
      highlightMarkPainter.setHighlightMarks(marks);
    },
    async describeCfi(cfi: string): Promise<ReaderLocationDescription> {
      const trimmed = cfi.trim();
      if (!trimmed) throw new Error("CFI is required.");
      if (destroyed) throw new Error("Engine is destroyed.");

      let spineIndex: number | undefined;
      let href: string | undefined;
      try {
        const parsed = new EpubCFI(trimmed);
        spineIndex = typeof parsed.spinePos === "number" ? parsed.spinePos : undefined;
        if (typeof spineIndex === "number") {
          const section = book.spine.get(spineIndex);
          href = section?.href ?? undefined;
        }
      } catch {
        // ignore parse/lookup errors; fall back to minimal description
      }

      let bookProgress: number | null = null;
      // Percentages are approximate UI metadata and depend on generated locations.
      // This method must never trigger rendition navigation; it reads what is available.
      try {
        if (locationsReady) {
          const p = book.locations.percentageFromCfi(trimmed);
          if (typeof p === "number" && Number.isFinite(p)) bookProgress = p;
        }
      } catch {
        // ignore
      }

      return { cfi: trimmed, href, spineIndex, bookProgress };
    },
    async searchBook(query: string, options?: ReaderSearchOptions): Promise<ReaderSearchResult[]> {
      if (destroyed) throw new Error("Engine is destroyed.");
      return searchEpubTsBook(book, query, readerToc, options);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        rendition.off("relocated", onRelocated);
        rendition.off("displayerror", onDisplayError);
        rendition.off("selected", onSelected);
      } catch {
        // ignore
      }
      try {
        rendition.destroy();
      } catch {
        // ignore
      }
      highlightMarkPainter.clear();
      try {
        // epubjs-style API (Book#destroy exists in upstream; keep defensive).
        (book as any).destroy?.();
      } catch {
        // ignore
      }
    },
  };
}
