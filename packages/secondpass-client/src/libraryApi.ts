import type { BookFileDownloadResult, LibraryAuthor, LibraryBook, LibraryGroup, LibrarySeries, LibraryTag, PaginatedResponse } from "./schemas/library";
import type { AuthenticatedClientContext } from "./clientContext";
import { authErrorMessages, requestBlob, requestJson, resolveUrl, tryParseFilename } from "./apiHttp";

const LIBRARY_FORBIDDEN_403 = "Token is not allowed to access the library (403).";
const LIBRARY_FILE_DOWNLOAD_FORBIDDEN_403 = "Token is not allowed to download files (403).";

export type BookListParams = {
  page?: number; pageSize?: number; q?: string; author?: string | number; series?: string | number;
  tag?: string; publisher?: string; ordering?: string; excludeGroup?: string | number;
};
export type EntityListParams = {
  q?: string; tag?: string; ordering?: string; page?: number; pageSize?: number; includePreviewBooks?: boolean;
};
export type TagListParams = { q?: string; ordering?: string; page?: number; pageSize?: number };
export type GroupListParams = { q?: string; ordering?: string; page?: number; pageSize?: number; includePreviewBooks?: boolean };

function addPageParams(url: URL, params: { page?: number; pageSize?: number }): void {
  if (params.page !== undefined) url.searchParams.set("page", String(params.page));
  if (params.pageSize !== undefined) url.searchParams.set("page_size", String(params.pageSize));
}

function addBookParams(url: URL, params: BookListParams): void {
  if (params.q) url.searchParams.set("q", params.q);
  if (params.author !== undefined) url.searchParams.set("author", String(params.author));
  if (params.series !== undefined) url.searchParams.set("series", String(params.series));
  if (params.tag) url.searchParams.set("tag", params.tag);
  if (params.publisher) url.searchParams.set("publisher", params.publisher);
  if (params.ordering) url.searchParams.set("ordering", params.ordering);
  if (params.excludeGroup !== undefined) url.searchParams.set("exclude_group", String(params.excludeGroup));
  addPageParams(url, params);
}

function addEntityParams(url: URL, params: EntityListParams): void {
  if (params.q) url.searchParams.set("q", params.q);
  if (params.tag) url.searchParams.set("tag", params.tag);
  if (params.ordering) url.searchParams.set("ordering", params.ordering);
  if (params.includePreviewBooks === true) url.searchParams.set("include_preview_books", "true");
  addPageParams(url, params);
}

function addTagParams(url: URL, params: TagListParams): void {
  if (params.q) url.searchParams.set("q", params.q);
  if (params.ordering) url.searchParams.set("ordering", params.ordering);
  addPageParams(url, params);
}

async function list<T>(ctx: AuthenticatedClientContext, path: string, configure: (url: URL) => void): Promise<PaginatedResponse<T>> {
  const url = new URL(resolveUrl(ctx.apiBaseUrl, path));
  configure(url);
  return requestJson<PaginatedResponse<T>>({ apiBaseUrl: ctx.apiBaseUrl, accessToken: ctx.accessToken, tokenType: ctx.tokenType, endpointOrUrl: url.toString(), options: { errorMessages: authErrorMessages({ forbidden: LIBRARY_FORBIDDEN_403 }) } });
}

async function get<T>(ctx: AuthenticatedClientContext, path: string, notFound: string, configure?: (url: URL) => void): Promise<T> {
  const url = new URL(resolveUrl(ctx.apiBaseUrl, path));
  configure?.(url);
  return requestJson<T>({ apiBaseUrl: ctx.apiBaseUrl, accessToken: ctx.accessToken, tokenType: ctx.tokenType, endpointOrUrl: url.toString(), options: { errorMessages: authErrorMessages({ forbidden: LIBRARY_FORBIDDEN_403, notFound }) } });
}

export const listBooks = (ctx: AuthenticatedClientContext, input?: { params?: BookListParams }) => list<LibraryBook>(ctx, "/library/books/", (url) => addBookParams(url, input?.params ?? {}));
export const getBook = (ctx: AuthenticatedClientContext, input: { bookId: string }) => get<LibraryBook>(ctx, `/library/books/${encodeURIComponent(input.bookId)}/`, "Book not found or not accessible (404).");
export const listSeries = (ctx: AuthenticatedClientContext, input?: EntityListParams) => list<LibrarySeries>(ctx, "/library/series/", (url) => addEntityParams(url, input ?? {}));
export const getSeries = (ctx: AuthenticatedClientContext, input: { seriesId: string; includePreviewBooks?: boolean }) => get<LibrarySeries>(ctx, `/library/series/${encodeURIComponent(input.seriesId)}/`, "Series not found or not accessible (404).", (url) => addEntityParams(url, input));
export const listAuthors = (ctx: AuthenticatedClientContext, input?: EntityListParams) => list<LibraryAuthor>(ctx, "/library/authors/", (url) => addEntityParams(url, input ?? {}));
export const getAuthor = (ctx: AuthenticatedClientContext, input: { authorId: string; includePreviewBooks?: boolean }) => get<LibraryAuthor>(ctx, `/library/authors/${encodeURIComponent(input.authorId)}/`, "Author not found or not accessible (404).", (url) => addEntityParams(url, input));
export const listTags = (ctx: AuthenticatedClientContext, input?: TagListParams) => list<LibraryTag>(ctx, "/library/tags/", (url) => addTagParams(url, input ?? {}));
export const getTag = (ctx: AuthenticatedClientContext, input: { tagId: string }) => get<LibraryTag>(ctx, `/library/tags/${encodeURIComponent(input.tagId)}/`, "Catalog tag not found or not accessible (404).");
export const listGroups = (ctx: AuthenticatedClientContext, input?: GroupListParams) => list<LibraryGroup>(ctx, "/library/groups/", (url) => addEntityParams(url, input ?? {}));
export const getGroup = (ctx: AuthenticatedClientContext, input: { groupId: string; includePreviewBooks?: boolean }) => get<LibraryGroup>(ctx, `/library/groups/${encodeURIComponent(input.groupId)}/`, "Library group not found or not accessible (404).", (url) => addEntityParams(url, input));
export const listGroupBooks = (ctx: AuthenticatedClientContext, input: { groupId: string; params?: BookListParams }) => list<LibraryBook>(ctx, `/library/groups/${encodeURIComponent(input.groupId)}/books/`, (url) => addBookParams(url, input.params ?? {}));
export const listGroupAuthors = (ctx: AuthenticatedClientContext, input: { groupId: string; params?: Omit<EntityListParams, "includePreviewBooks"> }) => list<LibraryAuthor>(ctx, `/library/groups/${encodeURIComponent(input.groupId)}/authors/`, (url) => addEntityParams(url, input.params ?? {}));
export const listGroupSeries = (ctx: AuthenticatedClientContext, input: { groupId: string; params?: Omit<EntityListParams, "includePreviewBooks"> }) => list<LibrarySeries>(ctx, `/library/groups/${encodeURIComponent(input.groupId)}/series/`, (url) => addEntityParams(url, input.params ?? {}));
export const listGroupTags = (ctx: AuthenticatedClientContext, input: { groupId: string; params?: TagListParams }) => list<LibraryTag>(ctx, `/library/groups/${encodeURIComponent(input.groupId)}/tags/`, (url) => addTagParams(url, input.params ?? {}));

export async function downloadBookFile(ctx: AuthenticatedClientContext, input: { bookId: string }): Promise<BookFileDownloadResult> {
  const { blob, response } = await requestBlob({ apiBaseUrl: ctx.apiBaseUrl, accessToken: ctx.accessToken, tokenType: ctx.tokenType, endpointOrUrl: resolveUrl(ctx.apiBaseUrl, `/library/books/${encodeURIComponent(input.bookId)}/download/`), options: { accept: "application/epub+zip, application/octet-stream, */*", errorMessages: authErrorMessages({ forbidden: LIBRARY_FILE_DOWNLOAD_FORBIDDEN_403 }) } });
  const contentType = response.headers.get("content-type") ?? undefined;
  const contentDisposition = response.headers.get("content-disposition") ?? undefined;
  const contentLengthRaw = response.headers.get("content-length");
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : undefined;
  return { blob, contentType, contentLength: Number.isFinite(contentLength) ? contentLength : undefined, contentDisposition, filename: contentDisposition ? tryParseFilename(contentDisposition) : undefined };
}
