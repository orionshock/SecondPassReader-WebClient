export { ApiError, type ApiErrorKind } from "./apiHttp";
export { createSecondPassClient } from "./client";
export type {
  SecondPassClient,
  SecondPassClientConfig,
  LibraryBookListParams,
  LibraryEntityListParams,
  SaveReadingProgressInput,
  CreateHighlightInput,
  CreateBookmarkInput,
  ListReadingAnnotationsInput,
  ReadingAnnotationMotivation,
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

export type { LibraryAuthor, LibraryBook, LibrarySeries, PaginatedResponse, PreviewBook } from "./schemas/library";

export type {
  ReadingAnnotation,
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
