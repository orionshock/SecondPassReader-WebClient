export { ApiError, type ApiErrorKind } from "./apiHttp";
export { createSecondPassClient } from "./client";
export type {
  SecondPassClient,
  SecondPassClientConfig,
  LibraryBookListParams,
  LibrarySearchParams,
  LibraryEntityListParams,
  LibraryTagListParams,
  LibraryGroupListParams,
  LibraryPreviewParams,
  LibraryGroupBookListParams,
  LibraryGroupEntityListParams,
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
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";
export type { CurrentUser, CurrentUserGroup, MePayload } from "./schemas/account";
export type { ServerInfo, ServerPublicGroup } from "./schemas/server";

export type { BookDetail, BookIdentifierScheme, CatalogTag, CatalogTagSummary, CompactBook, Author, AuthorSummary, BookFile, BookGroup, BookIdentifier, LibraryGroup, Series, SeriesSummary, PaginatedResponse, PreviewBook } from "./schemas/library";

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
