import type { BookFileDownloadResult, LibraryAuthor, LibraryBook, LibrarySeries, PaginatedResponse } from "../schemas/library";
import { ApiError, resolveUrl, tryParseFilename } from "./apiHttp";

export async function listBooks(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  params?: {
    q?: string;
    hasFiles?: boolean;
    series?: string | number;
    author?: string | number;
    ordering?: string;
    page?: number;
    pageSize?: number;
  };
}): Promise<PaginatedResponse<LibraryBook>> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = new URL(resolveUrl(input.apiBaseUrl, "/library/books/"));
  const params = input.params ?? {};

  if (params.q) url.searchParams.set("q", params.q);
  if (params.hasFiles !== undefined) url.searchParams.set("has_files", params.hasFiles ? "true" : "false");
  if (params.series !== undefined) url.searchParams.set("series", String(params.series));
  if (params.author !== undefined) url.searchParams.set("author", String(params.author));
  if (params.ordering) url.searchParams.set("ordering", params.ordering);
  if (params.page !== undefined) url.searchParams.set("page", String(params.page));
  if (params.pageSize !== undefined) url.searchParams.set("page_size", String(params.pageSize));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
  }
  if (res.status === 403) {
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access the library (403)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as PaginatedResponse<LibraryBook>;
}

export async function listSeries(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  page?: number;
}): Promise<PaginatedResponse<LibrarySeries>> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = new URL(resolveUrl(input.apiBaseUrl, "/library/series/"));
  if (input.page !== undefined) url.searchParams.set("page", String(input.page));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
  }
  if (res.status === 403) {
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access the library (403)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as PaginatedResponse<LibrarySeries>;
}

export async function getSeries(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  seriesId: string;
}): Promise<LibrarySeries> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = resolveUrl(input.apiBaseUrl, `/library/series/${encodeURIComponent(input.seriesId)}/`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
  }
  if (res.status === 403) {
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access the library (403)." });
  }
  if (res.status === 404) {
    throw new ApiError({ kind: "http_error", status: 404, message: "Series not found or not accessible (404)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as LibrarySeries;
}

export async function listAuthors(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  page?: number;
}): Promise<PaginatedResponse<LibraryAuthor>> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = new URL(resolveUrl(input.apiBaseUrl, "/library/authors/"));
  if (input.page !== undefined) url.searchParams.set("page", String(input.page));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
  }
  if (res.status === 403) {
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access the library (403)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as PaginatedResponse<LibraryAuthor>;
}

export async function getAuthor(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  authorId: string;
}): Promise<LibraryAuthor> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = resolveUrl(input.apiBaseUrl, `/library/authors/${encodeURIComponent(input.authorId)}/`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
  }
  if (res.status === 403) {
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access the library (403)." });
  }
  if (res.status === 404) {
    throw new ApiError({ kind: "http_error", status: 404, message: "Author not found or not accessible (404)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as LibraryAuthor;
}

export async function getBook(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  bookId: string;
}): Promise<LibraryBook> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = resolveUrl(input.apiBaseUrl, `/library/books/${encodeURIComponent(input.bookId)}/`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `${tokenType} ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
  }
  if (res.status === 403) {
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access the library (403)." });
  }
  if (res.status === 404) {
    throw new ApiError({ kind: "http_error", status: 404, message: "Book not found or not accessible (404)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as LibraryBook;
}

export async function downloadBookFile(input: {
  downloadUrl: string;
  accessToken: string;
  tokenType?: string;
}): Promise<BookFileDownloadResult> {
  const tokenType = input.tokenType ?? "Bearer";
  const res = await fetch(input.downloadUrl, {
    method: "GET",
    headers: {
      Accept: "application/epub+zip, application/octet-stream, */*",
      Authorization: `${tokenType} ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Token is invalid or revoked (401)." });
  }
  if (res.status === 403) {
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to download files (403)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  const contentType = res.headers.get("content-type") ?? undefined;
  const contentDisposition = res.headers.get("content-disposition") ?? undefined;
  const contentLengthRaw = res.headers.get("content-length");
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : undefined;

  const blob = await res.blob();
  const filename = contentDisposition ? tryParseFilename(contentDisposition) : undefined;

  return {
    blob,
    contentType,
    contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    contentDisposition,
    filename,
  };
}
