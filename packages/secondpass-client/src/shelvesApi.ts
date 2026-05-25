import type { PaginatedShelfItemResponse, PaginatedShelfResponse, Shelf } from "./schemas/shelves";
import { ApiError, resolveUrl } from "./apiHttp";

export async function listShelves(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
}): Promise<PaginatedShelfResponse> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = new URL(resolveUrl(input.apiBaseUrl, "/shelves/"));

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
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access shelves (403)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as PaginatedShelfResponse;
}

export async function getShelf(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  shelfId: string;
}): Promise<Shelf> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = resolveUrl(input.apiBaseUrl, `/shelves/${encodeURIComponent(input.shelfId)}/`);

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
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access shelves (403)." });
  }
  if (res.status === 404) {
    throw new ApiError({ kind: "http_error", status: 404, message: "Shelf not found or not accessible (404)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as Shelf;
}

export async function listShelfItems(input: {
  apiBaseUrl: string;
  accessToken: string;
  tokenType?: string;
  shelfId: string;
  page?: number;
}): Promise<PaginatedShelfItemResponse> {
  const tokenType = input.tokenType ?? "Bearer";
  const url = new URL(resolveUrl(input.apiBaseUrl, `/shelves/${encodeURIComponent(input.shelfId)}/items/`));
  if (typeof input.page === "number") url.searchParams.set("page", String(input.page));

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
    throw new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed to access shelves (403)." });
  }
  if (res.status === 404) {
    throw new ApiError({ kind: "http_error", status: 404, message: "Shelf not found or not accessible (404)." });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError({
      kind: "http_error",
      status: res.status,
      message: `Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
    });
  }

  return (await res.json()) as PaginatedShelfItemResponse;
}
