import { beforeEach, describe, expect, it } from "vitest";

import { createSecondPassClient } from "../index";
import type { CompactBook } from "../index";
import {
  blobResponse,
  installMockFetch as asMockFetch,
  installScriptedTransport,
  jsonResponse,
} from "./SdkTestTransport.Fixtures";

describe("SDK Library API", () => {
  beforeEach(() => {
    asMockFetch();
  });

  it("library books sends rebuilt catalog filters and server ordering", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.library.books.list({
      author: "a1",
      series: "s1",
      q: "space opera",
      tag: "award-winner",
      publisher: "Exact Press",
      ordering: "series_index",
      excludeGroup: "g1",
      page: 2,
      pageSize: 20,
    });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.example/library/books/");
    expect(url.searchParams.get("author")).toBe("a1");
    expect(url.searchParams.get("series")).toBe("s1");
    expect(url.searchParams.get("q")).toBe("space opera");
    expect(url.searchParams.get("tag")).toBe("award-winner");
    expect(url.searchParams.get("publisher")).toBe("Exact Press");
    expect(url.searchParams.get("ordering")).toBe("series_index");
    expect(url.searchParams.get("exclude_group")).toBe("g1");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("20");
  });

  it("library.books.get fetches an encoded book detail URL", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "book 1", title: "T", sort_title: "T", subtitle: "", authors: [], series: null, language: null, publisher: null, published_year: null, published_month: null, published_day: null, published_date_precision: "", cover_url: null, description: "", identifiers: [], catalog_tags: [], groups: [], file: { format: "epub", file_size: 4, checksum: "abc", download_url: "https://files.example/book.epub" } }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const book = await spl.library.books.get("book 1");

    expect(book.id).toBe("book 1");
    expect(book.file?.downloadUrl).toBe("https://files.example/book.epub");
    expect(book.groups).toEqual([]);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.example/library/books/book%201/");
  });

  it("library book list rows do not require groups or file data", async () => {
    const row = {
      id: "b1", title: "Book", sort_title: "Book", subtitle: "", authors: [], series: null, catalog_tags: [],
      language: "en", publisher: null, published_year: null, published_month: null, published_day: null,
      published_date_precision: "", cover_url: null, file_format: "epub",
    };
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 1, next: null, previous: null, results: [row] }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const result = await spl.library.books.list();
    expect(result.results[0]).not.toHaveProperty("groups");
    expect(result.results[0]).not.toHaveProperty("file");
  });

  it("projects the complete compact book contract", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      count: 1,
      next: "https://api.example/library/books/?page=2",
      previous: null,
      results: [{
        id: "b1",
        title: "Book",
        sort_title: "Book, The",
        subtitle: "A subtitle",
        authors: [{ id: "a1", name: "Author" }],
        series: { id: "s1", name: "Series", sort_name: "Series", series_index: "1.25" },
        catalog_tags: [{ id: "t1", name: "Science Fiction", slug: "science-fiction" }],
        language: "en",
        publisher: "Publisher",
        published_year: 2026,
        published_month: 8,
        published_day: 2,
        published_date_precision: "day",
        cover_url: "https://api.example/media/cover.jpg",
        file_format: "epub",
      }],
    }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const result = await spl.library.books.list();

    expect(result.results[0]).toEqual({
      id: "b1",
      title: "Book",
      sortTitle: "Book, The",
      subtitle: "A subtitle",
      authors: [{ id: "a1", name: "Author" }],
      series: { id: "s1", name: "Series", sortName: "Series", seriesIndex: "1.25" },
      catalogTags: [{ id: "t1", name: "Science Fiction", slug: "science-fiction" }],
      language: "en",
      publisher: "Publisher",
      publishedYear: 2026,
      publishedMonth: 8,
      publishedDay: 2,
      publishedDatePrecision: "day",
      coverUrl: "https://api.example/media/cover.jpg",
      fileFormat: "epub",
    });
  });

  it("projects book detail file, identifiers, groups, and omits compact fileFormat", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: "b1", title: "Book", sort_title: "Book", subtitle: "", authors: [], series: null,
      language: null, publisher: null, published_year: null, published_month: null, published_day: null,
      published_date_precision: "", cover_url: null, description: "Description",
      identifiers: [{ id: "i1", scheme: "isbn_13", value: "9780000000000" }],
      catalog_tags: [],
      file: { format: "epub", file_size: 123456, checksum: "checksum", download_url: "https://api.example/library/books/b1/download/" },
      groups: [{ id: "g1", name: "Public", description: "", is_public_group: true }],
    }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const book = await spl.library.books.get("b1");

    expect(book.file).toEqual({ format: "epub", fileSize: 123456, checksum: "checksum", downloadUrl: "https://api.example/library/books/b1/download/" });
    expect(book.identifiers).toEqual([{ id: "i1", scheme: "isbn_13", value: "9780000000000" }]);
    expect(book.groups).toEqual([{ id: "g1", name: "Public", description: "", isPublicGroup: true }]);
    expect(book).not.toHaveProperty("fileFormat");
  });

  it("library.search uses the slashless route and maps broad-search parameters", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });

    await spl.library.search({ q: "", ordering: "-series", excludeShelf: "s1", excludeGroup: "g1", page: 2, pageSize: 40 });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.example/library/search");
    expect(url.searchParams.get("q")).toBe("");
    expect(url.searchParams.get("ordering")).toBe("-series");
    expect(url.searchParams.get("exclude_shelf")).toBe("s1");
    expect(url.searchParams.get("exclude_group")).toBe("g1");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("40");
  });

  it("library tags list/get use catalog tag routes and query params", async () => {
    const transport = installScriptedTransport([
      { name: "list tags", response: jsonResponse({ count: 0, next: null, previous: null, results: [] }) },
      { name: "get tag", response: jsonResponse({ id: "t 1", name: "Classic", slug: "classic", book_count: 3 }) },
    ]);
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.library.tags.list({ q: "class", ordering: "-book_count", page: 2, pageSize: 10 });
    await spl.library.tags.get("t 1");

    const listUrl = new URL(String(transport.request("list tags").input));
    expect(listUrl.origin + listUrl.pathname).toBe("https://api.example/library/tags/");
    expect(listUrl.searchParams.get("q")).toBe("class");
    expect(listUrl.searchParams.get("ordering")).toBe("-book_count");
    expect(listUrl.searchParams.get("page")).toBe("2");
    expect(listUrl.searchParams.get("page_size")).toBe("10");
    expect(listUrl.searchParams.has("include_preview_books")).toBe(false);
    expect(listUrl.searchParams.has("preview_limit")).toBe(false);
    expect(String(transport.request("get tag").input)).toBe("https://api.example/library/tags/t%201/");
    transport.assertComplete();
  });

  it("library authors and series optionally request preview books and ordering", async () => {
    const preview = { id: "b1", title: "Book", cover_url: null };
    const transport = installScriptedTransport([
      { name: "list series", response: jsonResponse({ count: 0, next: null, previous: null, results: [] }) },
      { name: "list authors", response: jsonResponse({ count: 0, next: null, previous: null, results: [] }) },
      { name: "get series", response: jsonResponse({ id: "s1", name: "Series", preview_books: [preview] }) },
      { name: "get author", response: jsonResponse({ id: "a1", name: "Author" }) },
    ]);

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await spl.library.series.list({ q: "cycle", tag: "classic", page: 3, pageSize: 25, includePreviewBooks: true, previewLimit: 8, excludeId: "s0", ordering: "-book_count" });
    await spl.library.authors.list({ q: "le guin", tag: "classic", page: 4, pageSize: 10, includePreviewBooks: false, excludeId: "a0", ordering: "name" });
    const projectedSeries = await spl.library.series.get("s1", { includePreviewBooks: true, previewLimit: 4 });
    await spl.library.authors.get("a1");

    const seriesListUrl = new URL(String(transport.request("list series").input));
    expect(seriesListUrl.origin + seriesListUrl.pathname).toBe("https://api.example/library/series/");
    expect(seriesListUrl.searchParams.get("page")).toBe("3");
    expect(seriesListUrl.searchParams.get("include_preview_books")).toBe("true");
    expect(seriesListUrl.searchParams.get("preview_limit")).toBe("8");
    expect(seriesListUrl.searchParams.get("exclude_id")).toBe("s0");
    expect(seriesListUrl.searchParams.get("ordering")).toBe("-book_count");
    expect(seriesListUrl.searchParams.get("q")).toBe("cycle");
    expect(seriesListUrl.searchParams.get("tag")).toBe("classic");
    expect(seriesListUrl.searchParams.get("page_size")).toBe("25");

    const authorsListUrl = new URL(String(transport.request("list authors").input));
    expect(authorsListUrl.origin + authorsListUrl.pathname).toBe("https://api.example/library/authors/");
    expect(authorsListUrl.searchParams.get("include_preview_books")).toBe("false");
    expect(authorsListUrl.searchParams.get("exclude_id")).toBe("a0");

    expect(projectedSeries.previewBooks).toEqual([{ id: "b1", title: "Book", coverUrl: null }]);
    const seriesDetailUrl = new URL(String(transport.request("get series").input));
    expect(seriesDetailUrl.searchParams.get("preview_limit")).toBe("4");
    expect(String(transport.request("get author").input)).toBe("https://api.example/library/authors/a1/");
    transport.assertComplete();
  });
  it("library download URL helper rejects books without a file download URL", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 42, title: "No File" }));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await expect(spl.library.books.getDownloadUrl(42)).rejects.toThrowError(/without a file download URL/i);
  });


  it("library.books.download(book) downloads blob via internal download_url without app passing raw URL", async () => {
    const fetchMock = asMockFetch();
    const book = {
      id: 1,
      title: "T",
    } as unknown as CompactBook;

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
    expect(String(url)).toBe("https://api.example/library/books/1/download/");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
  });

  it("library.books.download(bookId) uses the dedicated download endpoint", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(blobResponse(new Blob(["epub"], { type: "application/epub+zip" })));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    const blob = await spl.library.books.download(1);
    expect(blob.size).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.example/library/books/1/download/");
  });

});
