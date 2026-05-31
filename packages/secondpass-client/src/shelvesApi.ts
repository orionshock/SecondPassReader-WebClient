import type { PaginatedShelfItemResponse, PaginatedShelfResponse, Shelf } from "./schemas/shelves";
import type { AuthenticatedClientContext } from "./clientContext";
import { requestJson, resolveUrl } from "./apiHttp";

export async function listShelves(ctx: AuthenticatedClientContext): Promise<PaginatedShelfResponse> {
  const url = new URL(resolveUrl(ctx.apiBaseUrl, "/shelves/"));
  return requestJson<PaginatedShelfResponse>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access shelves (403).",
      },
    },
  });
}

export async function getShelf(ctx: AuthenticatedClientContext, input: { shelfId: string }): Promise<Shelf> {
  const url = resolveUrl(ctx.apiBaseUrl, `/shelves/${encodeURIComponent(input.shelfId)}/`);
  return requestJson<Shelf>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url,
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access shelves (403).",
        404: "Shelf not found or not accessible (404).",
      },
    },
  });
}

export async function listShelfItems(
  ctx: AuthenticatedClientContext,
  input: { shelfId: string; page?: number },
): Promise<PaginatedShelfItemResponse> {
  const url = new URL(resolveUrl(ctx.apiBaseUrl, `/shelves/${encodeURIComponent(input.shelfId)}/items/`));
  if (typeof input.page === "number") url.searchParams.set("page", String(input.page));

  return requestJson<PaginatedShelfItemResponse>({
    apiBaseUrl: ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    tokenType: ctx.tokenType,
    endpointOrUrl: url.toString(),
    options: {
      errorMessages: {
        401: "Token is invalid or revoked (401).",
        403: "Token is not allowed to access shelves (403).",
        404: "Shelf not found or not accessible (404).",
      },
    },
  });
}
