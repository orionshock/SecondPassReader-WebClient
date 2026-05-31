export { ApiError, type ApiErrorKind } from "./apiHttp";
export { createSecondPassClient } from "./client";
export type {
  SecondPassClient,
  SecondPassClientConfig,
  LibraryBookListParams,
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
  MePayload,
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";

export type { LibraryAuthor, LibraryBook, LibrarySeries, PaginatedResponse } from "./schemas/library";

export type {
  ReadingAnnotation,
  ReadingAnnotationPage,
  ReadingOpenResponse,
  ReadingProgress,
  ReadingRecentSessionsResponse,
  ReadingSession,
  ReadingSessionSummary,
} from "./schemas/readingSession";

export type { PaginatedShelfItemResponse, PaginatedShelfResponse, Shelf, ShelfItem } from "./schemas/shelves";
