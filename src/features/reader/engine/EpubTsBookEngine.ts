import ePub, { type Book, type Location, type Rendition } from "@likecoin/epub-ts";
import type { ReaderLocation, ReaderLocationTarget } from "../domain/types";
import type { ReaderTocItem } from "../domain/types";

export type EpubTsBookEngineSource = string | ArrayBuffer | Blob;

export type EpubTsBookEngineInit = {
  source: EpubTsBookEngineSource;
  mountEl: HTMLElement;
  onLocationChanged?: (location: ReaderLocation) => void;
  onTocReady?: (toc: ReaderTocItem[]) => void;
  onError?: (error: unknown) => void;
};

export type EpubTsBookEngine = {
  display(target?: ReaderLocationTarget): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  destroy(): void;
};

function toRenditionTarget(target: ReaderLocationTarget | undefined): string | number | undefined {
  if (!target) return undefined;
  switch (target.type) {
    case "cfi":
      return target.cfi;
    case "cfiRange":
      return target.cfiRange;
    case "href":
      return target.href;
    case "progression":
      // epubjs-style APIs sometimes accept percentages, but we intentionally avoid guessing here.
      return undefined;
  }
}

function normalizeLocation(loc: Location): ReaderLocation {
  const start = loc.start;
  return {
    cfi: start.cfi,
    href: start.href,
    bookProgress: typeof start.percentage === "number" ? start.percentage : undefined,
    displayedPage: start.displayed?.page,
    displayedTotal: start.displayed?.total,
    raw: loc,
  };
}

function normalizeTocItems(items: Array<{ id: string; href: string; label: string; subitems?: any[] }>): ReaderTocItem[] {
  return items
    .filter((i) => i && typeof i.href === "string" && typeof i.label === "string")
    .map((i) => ({
      id: i.id,
      label: i.label,
      href: i.href,
      children: Array.isArray(i.subitems) ? normalizeTocItems(i.subitems) : undefined,
    }));
}

export async function createEpubTsBookEngine(init: EpubTsBookEngineInit): Promise<EpubTsBookEngine> {
  const book: Book = ePub(init.source, { replacements: "blobUrl" });

  // Ensure parsing/opening completes before rendering.
  await book.opened;
  if (book.replacementsReady) await book.replacementsReady;

  try {
    const nav = await book.loaded.navigation;
    const toc = normalizeTocItems(nav.toc as any);
    init.onTocReady?.(toc);
  } catch (err) {
    // TOC should not prevent reading; report as a non-fatal error.
    init.onError?.(err);
  }

  const rendition: Rendition = book.renderTo(init.mountEl, {
    width: "100%",
    height: "100%",
  });

  const onRelocated = (loc: Location) => {
    try {
      init.onLocationChanged?.(normalizeLocation(loc));
    } catch (err) {
      init.onError?.(err);
    }
  };

  const onDisplayError = (err: Error) => {
    init.onError?.(err);
  };

  rendition.on("relocated", onRelocated);
  rendition.on("displayerror", onDisplayError);

  let destroyed = false;

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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        rendition.off("relocated", onRelocated);
        rendition.off("displayerror", onDisplayError);
      } catch {
        // ignore
      }
      try {
        rendition.destroy();
      } catch {
        // ignore
      }
      try {
        // epubjs-style API (Book#destroy exists in upstream; keep defensive).
        (book as any).destroy?.();
      } catch {
        // ignore
      }
    },
  };
}
