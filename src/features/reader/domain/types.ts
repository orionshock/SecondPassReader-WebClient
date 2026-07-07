// Shared, engine-agnostic reader domain types.
//
// These are allowed to flow between orchestrator <-> shell and UI components.
// Engine-specific types from @likecoin/epub-ts should not appear above the engine layer.

export type ReaderLocation = {
  /**
   * Canonical restore anchor / primary persisted reading position (EPUB CFI).
   *
   * This is what we rely on to resume reading position across renderer changes.
   */
  cfi?: string;
  /**
   * Useful context / fallback / TOC matching (typically a spine href).
   *
   * Not authoritative for precise restore, but helpful for display and navigation intent.
   */
  href?: string;
  /**
   * Approximate whole-book progress (0..1) derived from the engine's location reporting.
   *
   * This is UI glue (e.g. "12%") and may be sent to the server for presentation, but it is
   * not authoritative and must not be used as the canonical restore anchor.
   */
  bookProgress?: number;
  /**
   * Rendition display metadata (not persisted as canonical position).
   */
  displayedPage?: number;
  displayedTotal?: number;
  raw?: unknown;
};

export type ReaderSelection = {
  cfiRange: string;
  text: string;
  /**
   * Optional quote context for anchoring/repair/export.
   *
   * The selection layer decides how much context is useful.
   * The server enforces `<= 500` chars for each of prefix/suffix.
   */
  quotePrefix?: string;
  quoteSuffix?: string;
  /**
   * Useful context (typically a spine href) for display/TOC matching.
   */
  href?: string;
  anchor?: { x: number; y: number };
};

export type ReaderTocItem = {
  id: string;
  label: string;
  href?: string;
  children?: ReaderTocItem[];
};

/**
 * Runtime/client-only description for a CFI.
 *
 * This is display data derived from the current book (TOC/spine/locations)
 * and must not be persisted as server-authoritative state.
 */
export type ReaderLocationDescription = {
  cfi: string;
  href?: string;
  spineIndex?: number;
  /**
   * Approximate whole-book progress (0..1) derived from generated locations when available.
   * Not authoritative; useful for UI labels like "21%".
   */
  bookProgress?: number | null;
};

export type ReaderCfiProbeResult =
  | { ok: true; code: "exists-visible" | "exists-in-book"; description?: string }
  | { ok: false; code: "invalid" | "missing-target" | "unsupported" | "resolution-failed"; error: string; description?: string };

export type ReaderSearchResult = {
  id: string;
  cfi: string;
  excerpt: string;
  repairedText?: string;
  quotePrefix?: string;
  quoteSuffix?: string;
  sectionIndex?: number;
  linearIndex?: number;
  sectionHref?: string;
  sectionIdref?: string;
  sectionLabel?: string;
};

export type ReaderSearchOptions = {
  maxResults?: number;
  maxSeqEle?: number;
  repairFullText?: string;
  signal?: AbortSignal;
  onProgress?: (results: ReaderSearchResult[]) => void;
};

export type ReaderLocationTarget =
  | { type: "cfi"; cfi: string }
  | { type: "cfiRange"; cfiRange: string }
  | { type: "href"; href: string };

export type ReaderAnnotation =
  | {
      kind: "highlight";
      id: string;
      cfiRange: string;
      text?: string;
      color?: string;
      href?: string;
      note?: string;
      readOnly?: boolean;
    }
  | {
      kind: "bookmark";
      id: string;
      cfi: string;
      href?: string;
      readOnly?: boolean;
    };

export type ReaderHighlightMark = {
  id: string;
  cfiRange: string;
  color?: string;
  text?: string;
  note?: string;
  readOnly?: boolean;
  sessionId?: string;
};
