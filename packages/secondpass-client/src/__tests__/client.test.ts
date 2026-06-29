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
    expect(payload.motivation).toEqual(["bookmarking"]);
    expect(payload.target?.selector?.type).toBe("FragmentSelector");
    expect(payload.target?.selector?.value).toBe("epubcfi(/6/2[chap01]!/4/1:0)");
  });

  it("reading.annotations.createBookmark does not add TextQuoteSelector context", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createBookmark({ sessionId: "sess-1", profileVersion: "pv1", cfi: "epubcfi(/6/2[chap01]!/4/1:0)" });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.target.selector.type).toBe("FragmentSelector");
    expect(Array.isArray(payload.target.selector)).toBe(false);
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
    expect(payload.motivation).toEqual(["highlighting", "commenting"]);
    expect(payload.target?.selector?.type).toBe("FragmentSelector");
    expect(payload.target?.selector?.value).toBe("epubcfi(/6/2[chap01]!/4/1:0,/1:10)");
    expect(payload.body).toEqual([
      { type: "TextualBody", purpose: "describing", value: "Selected text", color: "#ff0" },
      { type: "TextualBody", purpose: "commenting", value: "A note" },
    ]);
  });

  it("reading.annotations.createHighlight without quote context uses a single FragmentSelector", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createHighlight({
      sessionId: "sess-1",
      profileVersion: "pv1",
      cfiRange: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)",
      text: "Selected text",
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.target.selector).toMatchObject({ type: "FragmentSelector", value: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)" });
  });

  it("reading.annotations.createHighlight with quotePrefix/suffix uses selector array with TextQuoteSelector and clamps context to 500 chars", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const long = "x".repeat(800);
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createHighlight({
      sessionId: "sess-1",
      profileVersion: "pv1",
      cfiRange: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)",
      text: "Selected text",
      quotePrefix: ` ${long} `,
      quoteSuffix: long,
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.motivation).toEqual(["highlighting"]);
    expect(Array.isArray(payload.target.selector)).toBe(true);
    expect(payload.target.selector[0]).toMatchObject({ type: "FragmentSelector", value: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)" });
    expect(payload.target.selector[1]).toMatchObject({ type: "TextQuoteSelector", exact: "Selected text" });
    expect(payload.target.selector[1].prefix.length).toBe(500);
    expect(payload.target.selector[1].suffix.length).toBe(500);
    // Selected text is not clamped
    expect(payload.target.selector[1].exact).toBe("Selected text");
  });

  it("reading.annotations.list supports repeatable motivation filters and ordering", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.list({
      sessionId: "sess-1",
      ordering: "-created",
      motivation: ["highlighting", "bookmarking"],
      page: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(init?.method ?? "GET").toBe("GET");

    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe("https://api.example/reading/annotations/");
    expect(u.searchParams.get("session_id")).toBe("sess-1");
    expect(u.searchParams.get("ordering")).toBe("-created");
    expect(u.searchParams.get("page")).toBe("2");
    expect(u.searchParams.getAll("motivation").sort()).toEqual(["bookmarking", "highlighting"]);
  });

  it("reading.sessions.list sends q with existing filters and ignores whitespace-only q", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.sessions.list({
      bookId: 123,
      isActive: false,
      page: 2,
      pageSize: 50,
      q: "  ursula le guin  ",
    });
    await spl.reading.sessions.list({ q: "   " });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(firstUrl.origin + firstUrl.pathname).toBe("https://api.example/reading/sessions/");
    expect(firstUrl.searchParams.get("book")).toBe("123");
    expect(firstUrl.searchParams.get("is_active")).toBe("false");
    expect(firstUrl.searchParams.get("page")).toBe("2");
    expect(firstUrl.searchParams.get("page_size")).toBe("50");
    expect(firstUrl.searchParams.get("q")).toBe("ursula le guin");

    const secondUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(secondUrl.searchParams.has("q")).toBe(false);
  });

  it("shelves.list sends scoped and existing shelf filters", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.list({
      scope: "shared",
      ownerGroup: 42,
      book: "book-1",
      page: 2,
      pageSize: 25,
      includePreviewBooks: true,
    });
    await spl.shelves.list({ scope: "personal", book: 7, includePreviewBooks: false });

    const sharedUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(sharedUrl.origin + sharedUrl.pathname).toBe("https://api.example/shelves/");
    expect(sharedUrl.searchParams.get("scope")).toBe("shared");
    expect(sharedUrl.searchParams.get("owner_group")).toBe("42");
    expect(sharedUrl.searchParams.get("book")).toBe("book-1");
    expect(sharedUrl.searchParams.get("page")).toBe("2");
    expect(sharedUrl.searchParams.get("page_size")).toBe("25");
    expect(sharedUrl.searchParams.get("include_preview_books")).toBe("true");

    const personalUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(personalUrl.searchParams.get("scope")).toBe("personal");
    expect(personalUrl.searchParams.get("book")).toBe("7");
    expect(personalUrl.searchParams.has("owner_group")).toBe(false);
    expect(personalUrl.searchParams.has("include_preview_books")).toBe(false);
  });

  it("library authors and series optionally request preview books", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "s1", name: "Series" }))
      .mockResolvedValueOnce(jsonResponse({ id: "a1", name: "Author" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.library.series.list({ page: 3, includePreviewBooks: true });
    await spl.library.authors.list({ page: 4, includePreviewBooks: false });
    await spl.library.series.get("s1", { includePreviewBooks: true });
    await spl.library.authors.get("a1");

    const seriesListUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(seriesListUrl.origin + seriesListUrl.pathname).toBe("https://api.example/library/series/");
    expect(seriesListUrl.searchParams.get("page")).toBe("3");
    expect(seriesListUrl.searchParams.get("include_preview_books")).toBe("true");

    const authorsListUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(authorsListUrl.origin + authorsListUrl.pathname).toBe("https://api.example/library/authors/");
    expect(authorsListUrl.searchParams.get("page")).toBe("4");
    expect(authorsListUrl.searchParams.has("include_preview_books")).toBe(false);

    const seriesDetailUrl = new URL(String(fetchMock.mock.calls[2]![0]));
    expect(seriesDetailUrl.origin + seriesDetailUrl.pathname).toBe("https://api.example/library/series/s1/");
    expect(seriesDetailUrl.searchParams.get("include_preview_books")).toBe("true");

    const authorDetailUrl = new URL(String(fetchMock.mock.calls[3]![0]));
    expect(authorDetailUrl.origin + authorDetailUrl.pathname).toBe("https://api.example/library/authors/a1/");
    expect(authorDetailUrl.searchParams.has("include_preview_books")).toBe(false);
  });

  it("shelves.list preserves unscoped behavior and rejects personal owner-group filters", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.list({ ownerGroup: "group-1" });

    const unscopedUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(unscopedUrl.searchParams.has("scope")).toBe(false);
    expect(unscopedUrl.searchParams.get("owner_group")).toBe("group-1");

    await expect(
      spl.shelves.list({ scope: "personal", ownerGroup: "group-1" } as never),
    ).rejects.toThrowError(/cannot be combined/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reading.annotations.updateNote PATCHes body updates only (no anchors/session/motivation)", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ann-1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.updateNote("ann-1", { profileVersion: "pv1", note: "Hello" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/annotations/ann-1/");
    expect(init?.method).toBe("PATCH");

    const payload = JSON.parse(String(init?.body));
    expect(Object.keys(payload).sort()).toEqual(["body", "profile_version"]);
    expect(payload.profile_version).toBe("pv1");
    expect(payload.body).toEqual([{ type: "TextualBody", purpose: "commenting", value: "Hello" }]);
    expect(payload).not.toHaveProperty("target");
    expect(payload).not.toHaveProperty("session");
    expect(payload).not.toHaveProperty("motivation");
  });

  it("reading.annotations.updateNote can update highlight color but requires describing text", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ann-1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.updateNote("ann-1", {
      color: "#ff0",
      text: "Selected text",
      note: null,
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.body).toEqual([
      { type: "TextualBody", purpose: "describing", value: "Selected text", color: "#ff0" },
      { type: "TextualBody", purpose: "commenting", value: "" },
    ]);

    await expect(
      spl.reading.annotations.updateNote("ann-1", { color: "#ff0" }),
    ).rejects.toThrowError(/requires `text`/i);
  });

  it("reading.annotations.updateNote can clear note while still sending describing body updates", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ann-1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.updateNote("ann-1", {
      profileVersion: "pv1",
      text: "Selected text",
      color: "yellow",
      note: null,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/annotations/ann-1/");
    expect(init?.method).toBe("PATCH");

    const payload = JSON.parse(String(init?.body));
    expect(Object.keys(payload).sort()).toEqual(["body", "profile_version"]);
    expect(payload.profile_version).toBe("pv1");
    expect(payload.body).toEqual([
      { type: "TextualBody", purpose: "describing", value: "Selected text", color: "yellow" },
      { type: "TextualBody", purpose: "commenting", value: "" },
    ]);
    expect(payload).not.toHaveProperty("target");
    expect(payload).not.toHaveProperty("selector");
    expect(payload).not.toHaveProperty("session");
    expect(payload).not.toHaveProperty("book");
    expect(payload).not.toHaveProperty("motivation");
  });

  it("reading.annotations.updateNote includes both describing + commenting bodies when note is non-empty", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ann-1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.updateNote("ann-1", {
      profileVersion: "pv1",
      text: "Selected text",
      color: "green",
      note: "Note text",
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.body).toEqual([
      { type: "TextualBody", purpose: "describing", value: "Selected text", color: "green" },
      { type: "TextualBody", purpose: "commenting", value: "Note text" },
    ]);
    expect(payload).not.toHaveProperty("target");
    expect(payload).not.toHaveProperty("session");
    expect(payload).not.toHaveProperty("motivation");
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

  it("server.createLoginRequest submits the caller-provided editable client name", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "request-1",
        code: "ABCD",
        authorize_url: "https://server.example/authorize",
        poll_url: "https://api.example/client-api/login-request/request-1/poll/",
        expires_at: "2026-06-21T12:00:00Z",
        interval: 3,
      }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example" });
    await spl.server.createLoginRequest(
      {
        server_name: "Library Server",
        api_base_url: "https://api.example",
        client_api: {
          discovery_version: "1",
          discovery_endpoint: "/.well-known/secondpass",
          login_request_endpoint: "/client-api/login-request/",
          authorize_url: "https://server.example/authorize",
          poll_endpoint_template: "/client-api/login-request/{id}/poll/",
          token_type: "Bearer",
        },
      },
      {
        clientName: "SecondPass Reader \u00b7 Firefox on Linux",
        clientType: "reader",
      },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/client-api/login-request/");
    expect(JSON.parse(String(init?.body))).toEqual({
      client_name: "SecondPass Reader \u00b7 Firefox on Linux",
      client_type: "reader",
    });
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
