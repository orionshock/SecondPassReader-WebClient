export type { ReaderAnnotation, ReaderLocation, ReaderLocationTarget, ReaderSelection, ReaderTocItem } from "../domain/types";
import type { ReaderAnnotation, ReaderLocation, ReaderLocationTarget, ReaderSelection, ReaderTocItem } from "../domain/types";

export type ReadingShellEvent =
  | { type: "locationChanged"; location: ReaderLocation }
  | { type: "selectionChanged"; selection: ReaderSelection | null }
  | { type: "tocReady"; toc: ReaderTocItem[] }
  | { type: "displayError"; error: unknown };

export type ReadingShellCommand =
  | { type: "display"; target: ReaderLocationTarget }
  | { type: "next" }
  | { type: "previous" }
  | { type: "applyAnnotations"; annotations: ReaderAnnotation[] }
  | { type: "clearSelection" };
