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

function expectNoStaleLiveAnnotationFields(payload: unknown) {
  const text = JSON.stringify(payload);
  expect(text).not.toContain("profile_version");
  expect(text).not.toContain("motivation");
  expect(text).not.toContain("target");
  expect(text).not.toContain("body");
  expect(text).not.toContain("TextualBody");
  expect(text).not.toContain("FragmentSelector");
  expect(text).not.toContain("TextQuoteSelector");
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

  it("reading.annotations.createBookmark builds SPL bookmark payload", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createBookmark(
      {
        sessionId: "sess-1",
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
    expect(payload).toEqual({
      session: "sess-1",
      kind: "bookmark",
      selector: { kind: "epub_cfi", value: "epubcfi(/6/2[chap01]!/4/1:0)" },
    });
    expect(payload).not.toHaveProperty("profile_version");
    expect(payload).not.toHaveProperty("motivation");
    expect(payload).not.toHaveProperty("target");
    expect(payload).not.toHaveProperty("body");
    expectNoStaleLiveAnnotationFields(payload);
  });

  it("reading.annotations.createBookmark does not send highlight-only fields", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createBookmark({ sessionId: "sess-1", cfi: "epubcfi(/6/2[chap01]!/4/1:0)" });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.kind).toBe("bookmark");
    expect(payload).not.toHaveProperty("profile_version");
    expect(payload).not.toHaveProperty("quote");
    expect(payload).not.toHaveProperty("highlight_text");
    expect(payload).not.toHaveProperty("highlight_color");
    expect(payload).not.toHaveProperty("comment_text");
    expectNoStaleLiveAnnotationFields(payload);
  });

  it("reading.annotations.createHighlight builds SPL highlight payload including text/color and note", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createHighlight({
      sessionId: "sess-1",
      cfiRange: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)",
      text: "Selected text",
      color: "#ff0",
      note: "A note",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/annotations/");
    expect(init?.method).toBe("POST");

    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual({
      session: "sess-1",
      kind: "highlight",
      selector: { kind: "epub_cfi", value: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)" },
      highlight_text: "Selected text",
      quote: { exact: "Selected text" },
      highlight_color: "#ff0",
      comment_text: "A note",
    });
    expect(payload).not.toHaveProperty("profile_version");
    expectNoStaleLiveAnnotationFields(payload);
  });

  it("reading.annotations.createHighlight defaults missing color to yellow", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createHighlight({
      sessionId: "sess-1",
      cfiRange: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)",
      text: "Selected text",
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.selector).toEqual({ kind: "epub_cfi", value: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)" });
    expect(payload.highlight_color).toBe("yellow");
    expect(payload).not.toHaveProperty("profile_version");
    expectNoStaleLiveAnnotationFields(payload);
  });

  it("reading.annotations.createHighlight sends quotePrefix/suffix in SPL quote object", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "a1" }));

    const long = "x".repeat(800);
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.createHighlight({
      sessionId: "sess-1",
      cfiRange: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)",
      text: "Selected text",
      quotePrefix: ` ${long} `,
      quoteSuffix: long,
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.kind).toBe("highlight");
    expect(payload.selector).toEqual({ kind: "epub_cfi", value: "epubcfi(/6/2[chap01]!/4/1:0,/1:10)" });
    expect(payload).not.toHaveProperty("target");
    expect(payload.quote).toEqual({ exact: "Selected text", prefix: long, suffix: long });
    expect(payload).not.toHaveProperty("profile_version");
    expectNoStaleLiveAnnotationFields(payload);
  });

  it("reading.annotations.list supports repeatable kind filters and ordering", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.list({
      sessionId: "sess-1",
      bookId: 123,
      ordering: "-created",
      kind: ["highlight", "bookmark"],
      includeDeleted: true,
      page: 2,
      pageSize: 50,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(init?.method ?? "GET").toBe("GET");

    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe("https://api.example/reading/annotations/");
    expect(u.searchParams.get("session_id")).toBe("sess-1");
    expect(u.searchParams.get("book_id")).toBe("123");
    expect(u.searchParams.get("ordering")).toBe("-created");
    expect(u.searchParams.get("page")).toBe("2");
    expect(u.searchParams.get("page_size")).toBe("50");
    expect(u.searchParams.get("include_deleted")).toBe("true");
    expect(u.searchParams.getAll("kind").sort()).toEqual(["bookmark", "highlight"]);
    expect(u.searchParams.has("motivation")).toBe(false);
  });

  it("reading.annotations.batchCreate posts one-session SPL annotation batches", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ id: "a1", client_id: "row-1" }] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.batchCreate(
      {
        session: "sess-1",
        annotations: [
          {
            client_id: "row-1",
            kind: "highlight",
            selector: { kind: "epub_cfi", value: "epubcfi(/6/2,/4/2,/4/8)" },
            highlight_text: "Selected text",
            highlight_color: "yellow",
            comment_text: "Note",
          },
        ],
      },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/annotations/batch/");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual({
      session: "sess-1",
      annotations: [
        {
          client_id: "row-1",
          kind: "highlight",
          selector: { kind: "epub_cfi", value: "epubcfi(/6/2,/4/2,/4/8)" },
          highlight_text: "Selected text",
          highlight_color: "yellow",
          comment_text: "Note",
        },
      ],
    });
    expect(payload).not.toHaveProperty("profile_version");
    expect(payload).not.toHaveProperty("items");
    expect(payload.annotations[0]).not.toHaveProperty("session");
    expectNoStaleLiveAnnotationFields(payload);
  });

  it("reading.annotations.batchCreate rejects more than 100 items client-side", async () => {
    const fetchMock = asMockFetch();
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });

    await expect(
      spl.reading.annotations.batchCreate({
        session: "sess-1",
        annotations: Array.from({ length: 101 }, () => ({
          kind: "bookmark" as const,
          selector: { kind: "epub_cfi" as const, value: "epubcfi(/6/2)" },
        })),
      }),
    ).rejects.toThrowError(/at most 100/i);
    expect(fetchMock).not.toHaveBeenCalled();
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
      ordering: "-item_count",
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
    expect(sharedUrl.searchParams.get("ordering")).toBe("-item_count");

    const personalUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(personalUrl.searchParams.get("scope")).toBe("personal");
    expect(personalUrl.searchParams.get("book")).toBe("7");
    expect(personalUrl.searchParams.has("owner_group")).toBe(false);
    expect(personalUrl.searchParams.has("include_preview_books")).toBe(false);
  });

  it("library books sends server ordering with existing filters", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.library.books.list({
      author: "a1",
      series: "s1",
      ordering: "author",
      page: 2,
      pageSize: 20,
    });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.example/library/books/");
    expect(url.searchParams.get("author")).toBe("a1");
    expect(url.searchParams.get("series")).toBe("s1");
    expect(url.searchParams.get("ordering")).toBe("author");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("20");
  });

  it("library authors and series optionally request preview books and ordering", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "s1", name: "Series" }))
      .mockResolvedValueOnce(jsonResponse({ id: "a1", name: "Author" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.library.series.list({ page: 3, includePreviewBooks: true, ordering: "-book_count" });
    await spl.library.authors.list({ page: 4, includePreviewBooks: false, ordering: "name" });
    await spl.library.series.get("s1", { includePreviewBooks: true });
    await spl.library.authors.get("a1");

    const seriesListUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(seriesListUrl.origin + seriesListUrl.pathname).toBe("https://api.example/library/series/");
    expect(seriesListUrl.searchParams.get("page")).toBe("3");
    expect(seriesListUrl.searchParams.get("include_preview_books")).toBe("true");
    expect(seriesListUrl.searchParams.get("ordering")).toBe("-book_count");

    const authorsListUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(authorsListUrl.origin + authorsListUrl.pathname).toBe("https://api.example/library/authors/");
    expect(authorsListUrl.searchParams.get("page")).toBe("4");
    expect(authorsListUrl.searchParams.get("ordering")).toBe("name");
    expect(authorsListUrl.searchParams.has("include_preview_books")).toBe(false);

    const seriesDetailUrl = new URL(String(fetchMock.mock.calls[2]![0]));
    expect(seriesDetailUrl.origin + seriesDetailUrl.pathname).toBe("https://api.example/library/series/s1/");
    expect(seriesDetailUrl.searchParams.get("include_preview_books")).toBe("true");

    const authorDetailUrl = new URL(String(fetchMock.mock.calls[3]![0]));
    expect(authorDetailUrl.origin + authorDetailUrl.pathname).toBe("https://api.example/library/authors/a1/");
    expect(authorDetailUrl.searchParams.has("include_preview_books")).toBe(false);
  });

  it("library groups list/detail optionally request preview books and group books ordering", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "g1", name: "Group", is_public_group: true, is_curator: false }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.library.groups.list({ page: 2, includePreviewBooks: true, ordering: "name" });
    await spl.library.groups.get("g1", { includePreviewBooks: true });
    await spl.library.groups.books("g1", { page: 3, pageSize: 50, ordering: "title", hasFiles: true });

    const groupListUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(groupListUrl.origin + groupListUrl.pathname).toBe("https://api.example/library/groups/");
    expect(groupListUrl.searchParams.get("page")).toBe("2");
    expect(groupListUrl.searchParams.get("include_preview_books")).toBe("true");
    expect(groupListUrl.searchParams.get("ordering")).toBe("name");

    const groupDetailUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(groupDetailUrl.origin + groupDetailUrl.pathname).toBe("https://api.example/library/groups/g1/");
    expect(groupDetailUrl.searchParams.get("include_preview_books")).toBe("true");

    const groupBooksUrl = new URL(String(fetchMock.mock.calls[2]![0]));
    expect(groupBooksUrl.origin + groupBooksUrl.pathname).toBe("https://api.example/library/groups/g1/books/");
    expect(groupBooksUrl.searchParams.get("page")).toBe("3");
    expect(groupBooksUrl.searchParams.get("page_size")).toBe("50");
    expect(groupBooksUrl.searchParams.get("ordering")).toBe("title");
    expect(groupBooksUrl.searchParams.get("has_files")).toBe("true");
  });

  it("shelf items list sends server ordering", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.items("shelf-1", { page: 2, pageSize: 50, ordering: "author" });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.example/shelves/shelf-1/items/");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("50");
    expect(url.searchParams.get("ordering")).toBe("author");
  });

  it("shelf items list supports position, title, and author ordering without mutating shelf positions", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.items("shelf-1", { ordering: "position" });
    await spl.shelves.items("shelf-1", { ordering: "title" });
    await spl.shelves.items("shelf-1", { ordering: "author" });

    const orderings = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("ordering"));
    expect(orderings).toEqual(["position", "title", "author"]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.body).toBeUndefined();
    }
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

  it("reading.annotations.updateNote PATCHes only comment_text/highlight_color", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ann-1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.updateNote("ann-1", { note: "Hello" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/annotations/ann-1/");
    expect(init?.method).toBe("PATCH");

    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual({ comment_text: "Hello" });
    expect(payload).not.toHaveProperty("target");
    expect(payload).not.toHaveProperty("session");
    expect(payload).not.toHaveProperty("motivation");
    expect(payload).not.toHaveProperty("body");
    expect(payload).not.toHaveProperty("profile_version");
  });

  it("reading.annotations.updateNote can update highlight color without resending text", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ann-1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.updateNote("ann-1", {
      color: "#ff0",
      note: null,
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload).toEqual({ highlight_color: "#ff0", comment_text: "" });
  });

  it("reading.annotations.updateNote can clear note", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ann-1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.updateNote("ann-1", {
      color: "yellow",
      note: null,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/reading/annotations/ann-1/");
    expect(init?.method).toBe("PATCH");

    const payload = JSON.parse(String(init?.body));
    expect(payload).toEqual({ highlight_color: "yellow", comment_text: "" });
    expect(payload).not.toHaveProperty("target");
    expect(payload).not.toHaveProperty("selector");
    expect(payload).not.toHaveProperty("session");
    expect(payload).not.toHaveProperty("book");
    expect(payload).not.toHaveProperty("motivation");
  });

  it("reading.annotations.updateNote includes color and comment when note is non-empty", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ann-1" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.annotations.updateNote("ann-1", {
      color: "green",
      note: "Note text",
    });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload).toEqual({ highlight_color: "green", comment_text: "Note text" });
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

  it("reading sessions preserve can_open from server payloads", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "sess-1", can_open: false, is_active: true }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const session = await spl.reading.sessions.get("sess-1");

    expect(session.can_open).toBe(false);
  });

  it("reading sessions list preserves can_open from paginated server payloads", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: "sess-1", can_open: false, is_active: true },
          { id: "sess-2", can_open: true, is_active: false },
        ],
      }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const sessions = await spl.reading.sessions.list();

    expect(sessions.results.map((session) => session.can_open)).toEqual([false, true]);
  });

  it("reading session open/start/update payloads stay scoped to session fields", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ session: { id: "sess-1" }, profile_version: "pv1", progress: {}, annotations: { results: [] } }))
      .mockResolvedValueOnce(jsonResponse({ session: { id: "sess-2" }, profile_version: "pv2", progress: {}, annotations: { results: [] } }))
      .mockResolvedValueOnce(jsonResponse({ id: "sess-1", name: "Evening", notes: "Chapter 3" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.reading.sessions.open(123);
    await spl.reading.sessions.startOver(123);
    await spl.reading.sessions.updateDetails("sess-1", { name: "Evening", notes: "Chapter 3" });

    const [openUrl, openInit] = fetchMock.mock.calls[0]!;
    expect(String(openUrl)).toBe("https://api.example/reading/books/123/open/");
    expect(openInit?.method).toBe("POST");
    expect(JSON.parse(String(openInit?.body))).toEqual({});
    expectNoStaleLiveAnnotationFields(JSON.parse(String(openInit?.body)));

    const [startOverUrl, startOverInit] = fetchMock.mock.calls[1]!;
    expect(String(startOverUrl)).toBe("https://api.example/reading/books/123/start-over/");
    expect(startOverInit?.method).toBe("POST");
    expect(startOverInit?.body).toBeUndefined();

    const [updateUrl, updateInit] = fetchMock.mock.calls[2]!;
    expect(String(updateUrl)).toBe("https://api.example/reading/sessions/sess-1/");
    expect(updateInit?.method).toBe("PATCH");
    const updatePayload = JSON.parse(String(updateInit?.body));
    expect(updatePayload).toEqual({ name: "Evening", notes: "Chapter 3" });
    expect(updatePayload).not.toHaveProperty("profile_version");
    expect(updatePayload).not.toHaveProperty("current_location");
    expectNoStaleLiveAnnotationFields(updatePayload);
  });

  it("server.discover works without access token, while auth-required namespaces throw without access token", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        server_name: "S",
        server_description: "D",
        server_version: "1.2.3",
        server_release: "r1",
        server_release_date: "2026-07-06",
        api_base_url: "https://api.example",
      }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example" });
    const discovery = await spl.server.discover("https://server.example");
    expect(discovery.api_base_url).toBe("https://api.example");
    expect(discovery.server_release_date).toBe("2026-07-06");

    expect(() => spl.library.books.list()).toThrowError(ApiError);
  });

  it("server.createLoginRequest submits the caller-provided editable client name", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "request-1",
        code: "ABCD",
        authorize_url: "https://server.example/authorize",
        poll_url: "https://api.example/client-api/login-requests/request-1/poll/",
        expires_at: "2026-06-21T12:00:00Z",
        interval: 3,
      }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example" });
    await spl.server.createLoginRequest(
      {
        server_name: "Library Server",
        api_base_url: "https://api.example",
      },
      {
        clientName: "SecondPass Reader \u00b7 Firefox on Linux",
        clientType: "reader",
      },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/client-api/login-requests/");
    expect(JSON.parse(String(init?.body))).toEqual({
      client_name: "SecondPass Reader \u00b7 Firefox on Linux",
      client_type: "reader",
    });
  });

  it("account.getCurrent preserves banner and advanced group context", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        username: "ada",
        advanced_library_groups_enabled: true,
        banner_text: "Maintenance tonight",
      }),
    );

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const me = await spl.account.getCurrent();

    expect(me.advanced_library_groups_enabled).toBe(true);
    expect(me.banner_text).toBe("Maintenance tonight");
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
