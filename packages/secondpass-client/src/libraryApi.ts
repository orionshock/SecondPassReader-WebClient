import type { BookFileDownloadResult, LibraryAuthor, LibraryBook, LibrarySeries, PaginatedResponse } from "./schemas/library";
import type { AuthenticatedClientContext } from "./clientContext";
import { requestBlob, requestJson, resolveUrl, tryParseFilename } from "./apiHttp";

export async function listBooks(
  ctx: AuthenticatedClientContext,
  input?: {
    params?: {
      q?: string;
      hasFiles?: boolean;
      series?: string | number;
      author?: string | number;
      ordering?: string;
      page?: number;
      pageSize?: number;
    };
  },
): Promise<PaginatedResponse<LibraryBook>> {
  const url = new URL(resolveUrl(ctx.apiBaseUrl, "/library/books/"));
  const params = input?.params ?? {};

  if (params.q) url.searchParams.set("q", params.q);
  if (params.hasFiles !== undefined) url.searchParams.set("has_files", params.hasFiles ? "true" : "false");
  if (params.series !== undefined) url.searchParams.set("series", String(params.series));
  if (params.author !== undefined) url.searchParams.set("author", String(params.author));
  if (params.ordering) url.searchParams.set("ordering", params.ordering);
  if (params.page !== undefined) url.searchParams.set("page", String(params.page));
  if (params.pageSize !== undefined) url.searchParams.set("page_size", String(params.pageSize));

  return requestJson<PaginatedResponse<LibraryBook>>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access the library (403).",
      },
    },
  });
}

export async function listSeries(
  ctx: AuthenticatedClientContext,
  input?: { page?: number },
): Promise<PaginatedResponse<LibrarySeries>> {
  const url = new URL(resolveUrl(ctx.apiBaseUrl, "/library/series/"));
  if (input?.page !== undefined) url.searchParams.set("page", String(input.page));

  return requestJson<PaginatedResponse<LibrarySeries>>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access the library (403).",
      },
    },
  });
}

export async function getSeries(ctx: AuthenticatedClientContext, input: { seriesId: string }): Promise<LibrarySeries> {
  const url = resolveUrl(ctx.apiBaseUrl, `/library/series/${encodeURIComponent(input.seriesId)}/`);
  return requestJson<LibrarySeries>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access the library (403).",
        404: "Series not found or not accessible (404).",
      },
    },
  });
}

export async function listAuthors(
  ctx: AuthenticatedClientContext,
  input?: { page?: number },
): Promise<PaginatedResponse<LibraryAuthor>> {
  const url = new URL(resolveUrl(ctx.apiBaseUrl, "/library/authors/"));
  if (input?.page !== undefined) url.searchParams.set("page", String(input.page));

  return requestJson<PaginatedResponse<LibraryAuthor>>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access the library (403).",
      },
    },
  });
}

export async function getAuthor(ctx: AuthenticatedClientContext, input: { authorId: string }): Promise<LibraryAuthor> {
  const url = resolveUrl(ctx.apiBaseUrl, `/library/authors/${encodeURIComponent(input.authorId)}/`);
  return requestJson<LibraryAuthor>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access the library (403).",
        404: "Author not found or not accessible (404).",
      },
    },
  });
}

export async function getBook(ctx: AuthenticatedClientContext, input: { bookId: string }): Promise<LibraryBook> {
  const url = resolveUrl(ctx.apiBaseUrl, `/library/books/${encodeURIComponent(input.bookId)}/`);
  return requestJson<LibraryBook>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access the library (403).",
        404: "Book not found or not accessible (404).",
      },
    },
  });
}

export async function downloadBookFile(
  ctx: AuthenticatedClientContext,
  input: { downloadUrl: string },
): Promise<BookFileDownloadResult> {
  const { blob, response } = await requestBlob({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: input.downloadUrl,
    options: {
      accept: "application/epub+zip, application/octet-stream, */*",
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to download files (403).",
      },
    },
  });

  const contentType = response.headers.get("content-type") ?? undefined;
  const contentDisposition = response.headers.get("content-disposition") ?? undefined;
  const contentLengthRaw = response.headers.get("content-length");
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : undefined;

  const filename = contentDisposition ? tryParseFilename(contentDisposition) : undefined;

  return {
    blob,
    contentType,
    contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    contentDisposition,
    filename,
  };
}
