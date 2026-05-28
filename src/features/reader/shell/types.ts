export type ReaderLocation = {
  cfi?: string;
  href?: string;
  progression?: number;
  raw?: unknown;
};

export type ReaderSelection = {
  cfiRange: string;
  text: string;
  anchor?: { x: number; y: number };
};

export type ReaderTocItem = {
  id: string;
  label: string;
  href?: string;
  children?: ReaderTocItem[];
};

export type ReaderLocationTarget =
  | { type: "cfi"; cfi: string }
  | { type: "cfiRange"; cfiRange: string }
  | { type: "href"; href: string }
  | { type: "progression"; progression: number };

export type ReaderAnnotation =
  | {
      kind: "highlight";
      id: string;
      cfiRange: string;
      color?: string;
      readOnly?: boolean;
    }
  | {
      kind: "bookmark";
      id: string;
      cfi: string;
      readOnly?: boolean;
    };

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

