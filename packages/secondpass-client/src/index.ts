export { ApiError, type ApiErrorKind } from "./apiHttp";
export { createSecondPassClient } from "./client";
export type {
  SecondPassClient,
  SecondPassClientConfig,
  LibraryBookListParams,
  LibraryEntityListParams,
  LibraryTagListParams,
  LibraryGroupListParams,
  SaveReadingProgressInput,
  CreateHighlightInput,
  CreateBookmarkInput,
  ListReadingAnnotationsInput,
  ReadingAnnotationKind,
  ReadingAnnotationsOrdering,
  UpdateNoteInput,
} from "./client";

export type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MeGroup,
  MePayload,
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";

export type { LibraryAuthor, LibraryAuthorSummary, LibraryBook, LibraryBookFile, LibraryBookIdentifier, LibraryGroup, LibrarySeries, LibrarySeriesSummary, LibraryTag, LibraryTagSummary, PaginatedResponse, PreviewBook } from "./schemas/library";

export type {
  ReadingAnnotation,
  ReadingAnnotationBatchCreatePayload,
  ReadingAnnotationBatchCreateResponse,
  ReadingAnnotationPage,
  ReadingBookActivitySummaryResponse,
  ReadingBookActivitySummaryRow,
  ReadingOpenResponse,
  ReadingProgress,
  ReadingRecentSessionsResponse,
  ReadingSessionsListResponse,
  ReadingSession,
  ReadingSessionBookSummary,
  ReadingSessionSummary,
} from "./schemas/readingSession";

export type {
  AddShelfItemInput,
  CreateShelfInput,
  PaginatedShelfItemResponse,
  PaginatedShelfResponse,
  Shelf,
  ShelfItem,
  ShelfListParams,
  UpdateShelfInput,
  UpdateShelfItemInput,
} from "./schemas/shelves";
