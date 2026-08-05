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
} from "./client";

export type {
  ClientApiConsumeResponse,
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";
export type { CurrentUser, CurrentUserGroup, MePayload } from "./schemas/account";
export type { ServerInfo, ServerPublicGroup } from "./schemas/server";

export type { BookDetail, BookIdentifierScheme, CatalogTag, CatalogTagSummary, CompactBook, Author, AuthorSummary, BookFile, BookGroup, BookIdentifier, LibraryGroup, Series, SeriesSummary, PaginatedResponse, PreviewBook } from "./schemas/library";

export type {
  BoundedSessionBook,
  MarginaliaAnnotation,
  MarginaliaAnnotationBatchOperation,
  MarginaliaAnnotationCollection,
  MarginaliaAnnotationLocation,
  MarginaliaBookSessions,
  MarginaliaBookSummary,
  MarginaliaBookmark,
  MarginaliaBookmarkUpsert,
  MarginaliaBootstrap,
  MarginaliaHighlight,
  MarginaliaHighlightColor,
  MarginaliaHighlightUpsert,
  MarginaliaProgress,
  MarginaliaProgressInput,
  MarginaliaRecentSession,
  MarginaliaRecentSessions,
  MarginaliaSession,
  MarginaliaSessionDetail,
  MarginaliaSessionFinalizeInput,
  MarginaliaSessionListItem,
  MarginaliaSessionMetadataInput,
  MarginaliaSessionSummary,
  MarginaliaSessionStatus,
} from "./schemas/marginalia";

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
