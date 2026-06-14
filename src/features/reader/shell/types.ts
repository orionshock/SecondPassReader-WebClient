import type {
  ReaderLocation,
  ReaderLocationDescription,
  ReaderLocationTarget,
  ReaderSearchOptions,
  ReaderSearchResult,
  ReaderSelection,
  ReaderTocItem,
} from "../domain/types";

export type ReadingShellCommandValue =
  | { type: "display"; target: ReaderLocationTarget }
  | { type: "displaySearchResult"; cfi: string }
  | { type: "next" }
  | { type: "previous" }
  | { type: "resize" };

export type ReadingShellCommand = {
  seq: number;
  value: ReadingShellCommandValue;
};

export type ReaderDescribeCfiHandle = (cfi: string) => Promise<ReaderLocationDescription>;
export type ReaderSearchBookHandle = (query: string, options?: ReaderSearchOptions) => Promise<ReaderSearchResult[]>;

export type ReadingShellEvent =
  | { type: "locationChanged"; location: ReaderLocation }
  | { type: "selectionChanged"; selection: ReaderSelection | null }
  | { type: "tocReady"; toc: ReaderTocItem[] }
  | { type: "locationsReady" }
  | { type: "navigate"; target: ReaderLocationTarget }
  | { type: "searchResultDisplayed"; cfi: string }
  | { type: "highlightClicked"; annotationId: string; cfiRange: string; clientX?: number; clientY?: number }
  | { type: "displayError"; error: unknown };
