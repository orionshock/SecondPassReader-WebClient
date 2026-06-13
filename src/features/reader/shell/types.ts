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
  | { type: "next" }
  | { type: "previous" };

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
  | { type: "displayError"; error: unknown };
