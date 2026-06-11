import type { ReaderLocation, ReaderLocationTarget, ReaderSelection, ReaderTocItem } from "../domain/types";

export type ReadingShellEvent =
  | { type: "locationChanged"; location: ReaderLocation }
  | { type: "selectionChanged"; selection: ReaderSelection | null }
  | { type: "tocReady"; toc: ReaderTocItem[] }
  | { type: "locationsReady" }
  | { type: "navigate"; target: ReaderLocationTarget }
  | { type: "displayError"; error: unknown };
