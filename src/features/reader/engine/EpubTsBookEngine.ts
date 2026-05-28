import ePub, { type Book, type Location, type Rendition } from "@likecoin/epub-ts";
import type { ReaderLocation, ReaderLocationTarget } from "../domain/types";

export type EpubTsBookEngineSource = string | ArrayBuffer | Blob;

export type EpubTsBookEngineInit = {
  source: EpubTsBookEngineSource;
  mountEl: HTMLElement;
  initialTarget?: ReaderLocationTarget;
  onLocationChanged?: (location: ReaderLocation) => void;
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
    progression: typeof start.percentage === "number" ? start.percentage : undefined,
    displayedPage: start.displayed?.page,
    displayedTotal: start.displayed?.total,
    raw: loc,
  };
}

export async function createEpubTsBookEngine(init: EpubTsBookEngineInit): Promise<EpubTsBookEngine> {
  const book: Book = ePub(init.source, { replacements: "blobUrl" });

  // Ensure parsing/opening completes before rendering.
  await book.opened;
  if (book.replacementsReady) await book.replacementsReady;

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

  const initialTarget = toRenditionTarget(init.initialTarget);
  await rendition.display(initialTarget);

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
