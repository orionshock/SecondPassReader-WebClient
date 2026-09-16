import { beforeEach, describe, expect, it } from "vitest";

import { ApiError, createSecondPassClient } from "../index";
import type { CompactBook } from "../index";
import {
  requestAnonymousJsonUrl,
  requestAuthenticatedBlob,
  requestJson,
  requestPublicBlob,
  resolveUrl,
  tryParseFilename,
} from "../ApiHttp.Adapter";
import { blobResponse, installMockFetch as asMockFetch, jsonResponse } from "./SdkTestTransport.Fixtures";

describe("SDK HTTP contracts", () => {
  beforeEach(() => {
    asMockFetch();
  });

  it("api HTTP helpers use bearer auth and never synthesize Basic auth", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    expect(resolveUrl("https://api.example/root/", "relative/path")).toBe("https://api.example/root/relative/path");
    expect(resolveUrl("https://api.example/root/", "https://files.example/book.epub")).toBe("https://files.example/book.epub");

    await requestJson({
      apiBaseUrl: "https://api.example",
      accessToken: "token",
      tokenType: "Bearer",
      endpointOrUrl: "/direct/",
      options: { method: "POST", body: { hello: "world" } },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token");
    expect(headers.Authorization).not.toMatch(/^Basic /i);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ hello: "world" });
  });

  it("keeps authenticated credentials authoritative while preserving non-auth headers", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(blobResponse(new Blob(["x"])));

    await requestJson({
      apiBaseUrl: "https://api.example",
      accessToken: "configured-token",
      tokenType: "Token",
      endpointOrUrl: "/authenticated/",
      options: {
        method: "POST",
        headers: {
          Accept: "application/vnd.authenticated+json",
          Authorization: "Evil json auth",
          "X-Resource-Header": "kept",
          "Content-Type": "text/plain",
        },
        body: { authenticated: true },
      },
    });
    await requestAuthenticatedBlob({
      apiBaseUrl: "https://api.example",
      accessToken: "configured-token",
      tokenType: "Token",
      endpointOrUrl: "/file/",
      options: {
        accept: "application/epub+zip",
        headers: {
          Accept: "application/custom-binary",
          authorization: "Evil blob auth",
          "X-Blob-Header": "kept",
        },
      },
    });

    const authenticatedHeaders = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(authenticatedHeaders).toMatchObject({
      Accept: "application/vnd.authenticated+json",
      Authorization: "Token configured-token",
      "X-Resource-Header": "kept",
      "Content-Type": "application/json",
    });
    const blobHeaders = fetchMock.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(blobHeaders).toMatchObject({
      Accept: "application/custom-binary",
      Authorization: "Token configured-token",
      "X-Blob-Header": "kept",
    });
    expect(blobHeaders.authorization).toBeUndefined();
  });

  it("returns undefined for authenticated 204 JSON success", async () => {
    asMockFetch().mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(requestJson({
      apiBaseUrl: "https://api.example",
      accessToken: "token",
      tokenType: "Bearer",
      endpointOrUrl: "/empty/",
    })).resolves.toBeUndefined();
  });

  it("preserves network failures without wrapping them as ApiError", async () => {
    const networkFailure = new TypeError("Network unavailable");
    asMockFetch().mockRejectedValueOnce(networkFailure);

    await expect(requestAnonymousJsonUrl({ url: "https://api.example/unavailable/" }))
      .rejects.toBe(networkFailure);
  });

  it("api HTTP helpers surface specific error kinds and parse download filenames", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(new Response("missing", { status: 404, statusText: "Not Found" }))
      .mockResolvedValueOnce(new Response("nope", { status: 403, statusText: "Forbidden" }));

    await expect(
      requestAnonymousJsonUrl({ url: "https://api.example/missing/", errorMessages: { 404: "Custom not found." } }),
    ).rejects.toMatchObject({ kind: "http_error", status: 404, message: "Custom not found." });

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "token" });
    await expect(spl.library.books.download({ id: "1", title: "T" } as unknown as CompactBook)).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
    });

    expect(tryParseFilename("attachment; filename*=UTF-8''My%20Book.epub")).toBe("My Book.epub");
    expect(tryParseFilename("attachment; filename*=UTF-8''bad%ZZ.epub")).toBe("bad%ZZ.epub");
    expect(tryParseFilename("attachment; filename=\"plain.epub\"")).toBe("plain.epub");
    expect(tryParseFilename("attachment")).toBeUndefined();
  });

  it("API errors suppress HTML response bodies but retain a concise status", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(new Response("<!DOCTYPE html><html><body>Django 404</body></html>", {
        status: 404,
        statusText: "Not Found",
      }))
      .mockResolvedValueOnce(new Response("<html><body>Proxy failure</body></html>", {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "content-type": "text/html" },
      }))
      .mockResolvedValueOnce(new Response("<!DOCTYPE html><html><body>Missing recent endpoint</body></html>", {
        status: 404,
        statusText: "Not Found",
      }));

    await expect(requestAnonymousJsonUrl({ url: "https://api.example/missing/" })).rejects.toMatchObject({
      status: 404,
      statusText: "Not Found",
      message: "Request failed: 404 Not Found",
    });
    await expect(requestPublicBlob({
      url: "https://api.example/broken-download/",
    })).rejects.toMatchObject({
      status: 502,
      statusText: "Bad Gateway",
      message: "Request failed: 502 Bad Gateway",
    });
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "token" });
    await expect(spl.marginalia.sessions.recent()).rejects.toMatchObject({
      status: 404,
      statusText: "Not Found",
      message: "Request failed: 404 Not Found",
    });
  });

  it("API errors preserve non-HTML response detail", async () => {
    asMockFetch().mockResolvedValueOnce(new Response("Service unavailable", {
      status: 503,
      statusText: "Service Unavailable",
    }));

    await expect(requestAnonymousJsonUrl({ url: "https://api.example/unavailable/" })).rejects.toMatchObject({
      message: "Request failed: 503 Service Unavailable - Service unavailable",
    });
  });

  it("client config requires apiBaseUrl and authenticated Blob uses the default accept header", async () => {
    const fetchMock = asMockFetch();
    expect(() => createSecondPassClient({ apiBaseUrl: "" })).toThrowError(/apiBaseUrl is required/i);

    fetchMock.mockResolvedValueOnce(blobResponse(new Blob(["x"])));
    const result = await requestAuthenticatedBlob({
      apiBaseUrl: "https://api.example",
      accessToken: "token",
      tokenType: "Bearer",
      endpointOrUrl: "/files/book.epub",
    });

    expect(result.blob.size).toBe(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/files/book.epub");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/octet-stream, */*");
    expect(headers.Authorization).toBe("Bearer token");
  });



  it("401 marginalia responses surface as ApiError(kind=unauthorized)", async () => {
    const fetchMock = asMockFetch();
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    await expect(spl.marginalia.sessions.list()).rejects.toMatchObject({ kind: "unauthorized", status: 401 });
  });
});
