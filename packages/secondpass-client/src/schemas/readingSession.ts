import type { PaginatedResponse } from "./library";
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
  can_open?: boolean;
  book?: string | number | { id: string | number };
  created?: string;
  updated?: string;
  // Be permissive for forward-compat.
  [k: string]: unknown;
};

export type ReadingSessionBookSummary = {
  id: string | number;
  title: string;
  authors?: Array<{ id: string | number; name: string }> | null;
  series?: { id: string | number; name: string } | null;
  series_index?: number | string | null;
  cover_url?: string | null;
  [k: string]: unknown;
};

export type ReadingSessionsListResponse = PaginatedResponse<ReadingSessionSummary> & {
  context?: {
    book?: ReadingSessionBookSummary | null;
    [k: string]: unknown;
  };
};

export type ReadingSessionSummary = {
  id: string;
  name?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  can_open?: boolean | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  progression?: number | null;
  annotation_count?: number | null;
  book_id?: string | number | null;
  book?: ReadingSessionBookSummary | null;
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
  session?: string;
  book?: string | number | { id: string | number } | null;
  kind?: "highlight" | "bookmark" | string;
  selector?: ReadingAnnotationSelector | unknown;
  quote?: ReadingAnnotationQuote | null;
  highlight_text?: string | null;
  highlight_color?: string | null;
  comment_text?: string | null;
  has_comment?: boolean;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
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

export type ReadingRecentSessionsItem = {
  last_activity_at: string;
  session: {
    id: string;
    name?: string | null;
    status: "active" | string;
    is_active: true | boolean;
    progression?: number | null;
    [k: string]: unknown;
  };
  book: {
    id: string | number;
    title: string;
    cover_url?: string | null;
    [k: string]: unknown;
  };
};

export type ReadingRecentSessionsResponse = {
  count: number;
  results: ReadingRecentSessionsItem[];
};

export type ReadingProgressUpdatePayload = {
  profile_version: string;
  current_location?: ReadingCurrentLocation | null;
  progression?: number | null;
};

export type ReadingAnnotationSelector = {
  kind: "epub_cfi";
  value: string;
};

export type ReadingAnnotationQuote = {
  exact: string;
  prefix?: string;
  suffix?: string;
};

export type ReadingAnnotationCreatePayload = {
  session: string;
  kind: "highlight" | "bookmark";
  selector: ReadingAnnotationSelector;
  quote?: ReadingAnnotationQuote;
  highlight_text?: string;
  highlight_color?: string;
  comment_text?: string;
};

export type ReadingAnnotationUpdatePayload = {
  comment_text?: string | null;
  highlight_color?: string | null;
};

export type ReadingAnnotationBatchCreateItem = Omit<ReadingAnnotationCreatePayload, "session"> & {
  client_id?: string;
};

export type ReadingAnnotationBatchCreatePayload = {
  session: string;
  annotations: ReadingAnnotationBatchCreateItem[];
};

export type ReadingAnnotationBatchCreateResponse = {
  results: Array<ReadingAnnotation & { client_id?: string }>;
  [k: string]: unknown;
};

export type ReadingBookActivitySummaryRow = {
  book: string | number | ReadingSessionBookSummary;
  session_count: number;
  active_session_count: number;
  active_session_id?: string | null;
  latest_session_id?: string | null;
  latest_session_updated_at?: string | null;
  [k: string]: unknown;
};

export type ReadingBookActivitySummaryResponse = {
  results: ReadingBookActivitySummaryRow[];
  [k: string]: unknown;
};
