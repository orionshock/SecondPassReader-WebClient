// Shared, engine-agnostic reader domain types.
//
// These are allowed to flow between orchestrator <-> shell and UI components.
// Engine-specific types from @likecoin/epub-ts should not appear above the engine layer.

export type ReaderLocation = {
  cfi?: string;
  href?: string;
  progression?: number;
  displayedPage?: number;
  displayedTotal?: number;
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

