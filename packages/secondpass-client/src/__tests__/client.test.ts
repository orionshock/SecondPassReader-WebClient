import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, createSecondPassClient } from "../index";
import type { LibraryBook } from "../index";

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function emptyResponse(init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(null, {
    status: init?.status ?? 204,
    headers: init?.headers,
  });
}

function blobResponse(blob: Blob, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(blob, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

function asMockFetch() {
  const f = globalThis.fetch;
  if (!f || typeof f !== "function") throw new Error("global fetch is not available in this test environment.");
  return vi.mocked(globalThis.fetch);
}

describe("@secondpass/client high-level workflows", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("reading.progress.save maps app-friendly input to wire payload and PATCHes the progress endpoint", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "p1", profile_version: "pv1", progression: 0.12, current_location: { format: "epub", cfi: "cfi" } }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.progress.save("sess-1", {
      profileVersion: "pv1",
      cfi: "epubcfi(/6/2[chap01]!/4/1:0)",
      href: "OEBPS/ch01.xhtml",
      bookProgress: 0.34,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/sessions/sess-1/progress/");
    expect(init?.method).toBe("PATCH");

    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");

    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual({
      profile_version: "pv1",
      current_location: {
        format: "epub",
        cfi: "epubcfi(/6/2[chap01]!/4/1:0)",
        href: "OEBPS/ch01.xhtml",
      },
      progression: 0.34,
    });
  });

  it("reading.annotations.createBookmark builds bookmark motivation + CFI selector payload", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createBookmark(
      {
        sessionId: "sess-1",
        profileVersion: "pv1",
        cfi: "epubcfi(/6/2[chap01]!/4/1:0)",
      },
      { idempotencyKey: "k1" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/annotations/");
    expect(init?.method).toBe("POST");

    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
    expect(headers["Idempotency-Key"]).toBe("k1");

    const payload = JSON.parse(String(init?.body));
    expect(payload.profile_version).toBe("pv1");
    expect(payload.session).toBe("sess-1");
    expect(payload.motivation).toBe("bookmarking");
    expect(payload.target?.selector?.type).toBe("FragmentSelector");
    expect(payload.target?.selector?.value).toBe("epubcfi(/6/2[chap01]!/4/1:0)");
  });

  it("reading.annotations.createHighlight builds highlight payload including text/color and note bodies", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createHighlight({
      sessionId: "sess-1",
      profileVersion: "pv1",
      cfiRange: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)",
      text: "Selected text",
      color: "#ff0",
      note: "A note",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/annotations/");
    expect(init?.method).toBe("POST");

    const payload = JSON.parse(String(init?.body));
    expect(payload.motivation).toBe("highlighting");
    expect(payload.target?.selector?.value).toBe("epubcfi(/6/2[chap01]!/4/1:0,/1:10)");
    expect(payload.body).toEqual([
      { type: "TextualBody", purpose: "describing", value: "Selected text", color: "#ff0" },
      { type: "TextualBody", purpose: "commenting", value: "A note" },
    ]);
  });

  it("library.books.download(book) downloads blob via internal download_url without app passing raw URL", async () => {
    const fetchMock = asMockFetch();
    const book: LibraryBook = {
      id: 1,
      title: "T",
      file: { id: 10, download_url: "https://files.example/book.epub" },
    };

    fetchMock.mockResolvedValueOnce(
      blobResponse(new Blob(["epub"], { type: "application/epub+zip" }), {
        headers: { "content-type": "application/epub+zip", "content-disposition": "attachment; filename=\"book.epub\"" },
      }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const blob = await spl.library.books.download(book);
    expect(blob.size).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://files.example/book.epub");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
  });

  it("library.books.download(bookId) fetches the book then downloads the blob", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: 1,
          title: "T",
          file: { id: 10, download_url: "https://files.example/book.epub" },
        }),
      )
      .mockResolvedValueOnce(blobResponse(new Blob(["epub"], { type: "application/epub+zip" })));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const blob = await spl.library.books.download(1);
    expect(blob.size).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.example/library/books/1/");
    expect(String(fetchMock.mock.calls[1]![0])).toBe("https://files.example/book.epub");
  });

  it("reading.openForReading opens session then downloads blob and returns both", async () => {
    const fetchMock = asMockFetch();
    const book: LibraryBook = {
      id: 1,
      title: "T",
      file: { id: 10, download_url: "https://files.example/book.epub" },
    };

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          profile_version: "pv1",
          session: { id: "sess-1" },
          progress: { current_location: null, progression: null },
          annotations: { count: 0, next: null, previous: null, results: [] },
        }),
      )
      .mockResolvedValueOnce(blobResponse(new Blob(["epub"], { type: "application/epub+zip" })));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const res = await spl.reading.openForReading(book);
    expect(res.open.profile_version).toBe("pv1");
    expect(res.blob.size).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.example/reading/books/1/open/");
    expect(String(fetchMock.mock.calls[1]![0])).toBe("https://files.example/book.epub");
  });

  it("server.discover works without access token, while auth-required namespaces throw without access token", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        server_name: "S",
        api_base_url: "https://api.example",
        client_api: {
          discovery_version: "1",
          discovery_endpoint: "/.well-known/secondpass",
          login_request_endpoint: "/client-api/login-request/",
          authorize_url: "https://example/auth",
          poll_endpoint_template: "/client-api/login-request/{id}/poll/",
          token_type: "Bearer",
        },
      }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example" });
    const discovery = await spl.server.discover("https://server.example");
    expect(discovery.api_base_url).toBe("https://api.example");

    expect(() => spl.library.books.list()).toThrowError(ApiError);
  });

  it("401 responses surface as ApiError(kind=unauthorized) and 204 JSON responses are handled", async () => {
    const fetchMock = asMockFetch();

    fetchMock.mockResolvedValueOnce(emptyResponse({ status: 204 }));
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await expect(spl.reading.annotations.remove("ann-1")).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    await expect(spl.reading.sessions.list()).rejects.toMatchObject({ kind: "unauthorized", status: 401 });
  });
});

