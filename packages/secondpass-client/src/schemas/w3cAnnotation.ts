export type JsonLdContext = string | Record<string, unknown> | Array<string | Record<string, unknown>>;

export type W3CAnnotationMotivation = "highlighting" | "bookmarking" | "commenting" | string;

export type W3CTextualBody = {
  type: "TextualBody";
  value: string;
  purpose?: "describing" | "highlighting" | "commenting" | string;
  format?: "text/plain" | string;
  language?: string;
  // Server extension used for highlight semantic tokens (yellow/green/etc.).
  color?: string;
};

export type W3CFragmentSelector = {
  type: "FragmentSelector";
  conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html" | string;
  value: string;
};

export type W3CAnnotation = {
  "@context"?: JsonLdContext;
  id?: string;
  type: "Annotation";
  /**
   * Server contract: motivations are always represented as an array.
   *
   * Examples:
   * - Bookmark: ["bookmarking"]
   * - Highlight: ["highlighting"]
   * - Highlight with note: ["highlighting", "commenting"]
   */
  motivation?: W3CAnnotationMotivation[];
  body?: W3CTextualBody | W3CTextualBody[] | unknown;
  target: W3CAnnotationTarget;
  created?: string;
  modified?: string;
  sessionId?: string;
  sourceSession?: string;
  derivedFrom?: string;
};

export type W3CAnnotationTarget = {
  source: string | { id: string; type?: string };
  selector?: W3CSelector | W3CSelector[] | W3CFragmentSelector;
};

export type W3CSelector =
  | W3CFragmentSelector
  | {
      type: "RangeSelector";
      startSelector: W3CSelector;
      endSelector: W3CSelector;
    }
  | {
      type: "TextQuoteSelector";
      exact: string;
      prefix?: string;
      suffix?: string;
    }
  | {
      type: "TextPositionSelector";
      start: number;
      end: number;
    }
  | {
      type: string;
      [key: string]: unknown;
    };
