import { ApiError } from "./ApiHttp.Adapter";

export type ClientContext = {
  apiRootUrl: string;
  /**
   * Optional: `server.*` discovery/linking calls may be unauthenticated.
   *
   * Most other namespaces require auth; use `requireAuth(ctx)`.
   */
  accessToken?: string;
  tokenType: string;
};

export type AuthenticatedClientContext = {
  apiRootUrl: string;
  accessToken: string;
  tokenType: string;
};

export function createClientContext(input: {
  apiRootUrl: string;
  accessToken?: string;
  tokenType?: string;
}): ClientContext {
  if (!input.apiRootUrl) throw new Error("SecondPassClient config.apiRootUrl is required.");
  return {
    apiRootUrl: input.apiRootUrl,
    accessToken: input.accessToken,
    tokenType: input.tokenType ?? "Bearer",
  };
}

export function requireAuth(ctx: ClientContext): AuthenticatedClientContext {
  if (!ctx.accessToken) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Access token is missing." });
  }
  return { apiRootUrl: ctx.apiRootUrl, accessToken: ctx.accessToken, tokenType: ctx.tokenType };
}

