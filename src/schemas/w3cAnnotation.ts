export type JsonLdContext = string | Record<string, unknown> | Array<string | Record<string, unknown>>;

export type W3CAnnotation = {
  "@context"?: JsonLdContext;
  id?: string;
  type: "Annotation";
  body?: unknown;
  target: W3CAnnotationTarget;
  created?: string;
  modified?: string;
  motivation?: string | string[];
};

export type W3CAnnotationTarget = {
  source: string;
  selector?: W3CSelector | W3CSelector[];
};

export type W3CSelector =
  | {
      type: "FragmentSelector";
      conformsTo?: string;
      value: string;
    }
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

