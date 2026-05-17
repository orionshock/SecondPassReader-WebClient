import type { PaginatedResponse } from "./library";
import type { W3CAnnotationMotivation, W3CAnnotationTarget, W3CTextualBody } from "./w3cAnnotation";

export type ReadingCurrentLocation = {
  format: "epub" | string;
  cfi?: string;
  href?: string;
  // Allow selector form too (some serializers may embed selector directly).
  selector?: {
    type: "FragmentSelector" | string;
    conformsTo?: string;
    value: string;
  };
};

export type ReadingSession = {
  id: string;
  status?: string;
  book?: string | number | { id: string | number };
  created?: string;
  updated?: string;
  // Be permissive for forward-compat.
  [k: string]: unknown;
};

export type ReadingProgress = {
  id?: string;
  profile_version?: string;
  current_location?: ReadingCurrentLocation | null;
  progression?: number | null;
  created?: string;
  updated?: string;
  [k: string]: unknown;
};

export type ReadingAnnotation = {
  id: string;
  profile_version?: string;
  session?: string;
  motivation?: W3CAnnotationMotivation | W3CAnnotationMotivation[] | string | string[];
  target?: Partial<W3CAnnotationTarget> | unknown;
  body?: Array<Partial<W3CTextualBody> & Record<string, unknown>> | unknown;
  is_deleted?: boolean;
  created?: string;
  modified?: string;
  [k: string]: unknown;
};

export type ReadingAnnotationPage = PaginatedResponse<ReadingAnnotation>;

export type ReadingOpenResponse = {
  profile_version: string;
  session: ReadingSession;
  progress: ReadingProgress;
  annotations: ReadingAnnotationPage;
};

export type ReadingProgressUpdatePayload = {
  profile_version: string;
  current_location?: ReadingCurrentLocation | null;
  progression?: number | null;
};

export type ReadingAnnotationCreatePayload = {
  profile_version: string;
  session: string;
  motivation: "highlighting" | "commenting" | string;
  target: {
    selector: {
      type: "FragmentSelector";
      conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html" | string;
      value: string;
    };
  };
  body: Array<
    | (W3CTextualBody & { color?: string })
    | {
        type: "TextualBody";
        purpose: string;
        value: string;
        color?: string;
        [k: string]: unknown;
      }
  >;
};

