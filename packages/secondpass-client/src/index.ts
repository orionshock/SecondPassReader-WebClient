export { ApiError, type ApiErrorKind } from "./ApiHttp.Adapter";
export { createSecondPassClient } from "./SecondPassClient.Factory";
export { deriveApiRootUrl } from "./ServerRoute.Policy";
export { isServerId } from "./ServerIdentity.Policy";
export { isLibraryBaseUrl } from "./ServerRoute.Policy";
export { normalizeLibraryBaseUrl } from "./ServerRoute.Policy";
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
  LibraryGroupSearchParams,
  LibraryGroupEntityListParams,
} from "./SecondPassClient.Types";

export type {
  ClientApiConsumeResponse,
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  SecondPassDiscovery,
} from "./schemas/ClientApiAuth.Types";
export type { CurrentUser, CurrentUserGroup, MePayload } from "./schemas/Account.Types";
export type { ServerInfo, ServerPublicGroup } from "./schemas/Server.Types";

export type { BookCoverDownloadResult, BookDetail, BookIdentifierScheme, CatalogResultPage, CatalogTag, CatalogTagSummary, CompactBook, Author, AuthorSummary, BookFile, BookGroup, BookIdentifier, LibraryGroup, Series, SeriesSummary, PaginatedResponse, PreviewBook } from "./schemas/Library.Types";

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
} from "./schemas/Marginalia.Types";

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
} from "./schemas/Shelves.Types";
