import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSecondPassClient } from "../index";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const page = { count: 0, next: null, previous: null, results: [] };

describe("library group client", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("maps group preview controls on list and detail", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(json(page)).mockResolvedValueOnce(json({ id: "group-1", name: "Group", description: "", is_public_group: false, preview_books: [] }));
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "token" });
    await spl.library.groups.list({ q: "club", book: "book-1", ordering: "-name", includePreviewBooks: true, previewLimit: 8, pageSize: 25 });
    await spl.library.groups.get("group-1", { includePreviewBooks: true, previewLimit: 4 });
    const listUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(listUrl.searchParams.get("preview_limit")).toBe("8");
    expect(listUrl.searchParams.get("book")).toBe("book-1");
    const detailUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(detailUrl.searchParams.get("preview_limit")).toBe("4");
  });

  it("keeps group book q on the title-filter browse endpoint", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => json(page));
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "token" });
    await spl.library.groups.books("group-1", { q: "broad", excludeShelf: "shelf-1", series: "series-1", ordering: "series_index" });
    const booksUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(booksUrl.origin + booksUrl.pathname).toBe("https://api.example/library/groups/group-1/books/");
    expect(booksUrl.searchParams.get("q")).toBe("broad");
    expect(booksUrl.searchParams.get("exclude_shelf")).toBe("shelf-1");
    expect(booksUrl.searchParams.get("ordering")).toBe("series_index");
  });

  it("maps group broad search to the scoped search endpoint", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => json(page));
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "token" });
    await spl.library.groups.search("group 1", { q: "broad", ordering: "-author", excludeShelf: "shelf-1", page: 2, pageSize: 40 });
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.example/library/groups/group%201/search");
    expect(url.searchParams.get("q")).toBe("broad");
    expect(url.searchParams.get("ordering")).toBe("-author");
    expect(url.searchParams.get("exclude_shelf")).toBe("shelf-1");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("40");
  });

  it("maps normalized group author and series axis controls", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => json(page));
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "token" });
    await spl.library.groups.authors("group-1", { q: "author", excludeId: "author-0", ordering: "-book_count", includePreviewBooks: true, previewLimit: 6 });
    await spl.library.groups.series("group-1", { q: "series", tag: "classic", excludeId: "series-0", ordering: "name", includePreviewBooks: true, previewLimit: 5 });
    const authorsUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(authorsUrl.origin + authorsUrl.pathname).toBe("https://api.example/library/groups/group-1/authors/");
    expect(authorsUrl.searchParams.get("q")).toBe("author");
    expect(authorsUrl.searchParams.get("exclude_id")).toBe("author-0");
    expect(authorsUrl.searchParams.get("ordering")).toBe("-book_count");
    expect(authorsUrl.searchParams.get("preview_limit")).toBe("6");
    const seriesUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(seriesUrl.origin + seriesUrl.pathname).toBe("https://api.example/library/groups/group-1/series/");
    expect(seriesUrl.searchParams.get("q")).toBe("series");
    expect(seriesUrl.searchParams.get("tag")).toBe("classic");
    expect(seriesUrl.searchParams.get("exclude_id")).toBe("series-0");
    expect(seriesUrl.searchParams.get("preview_limit")).toBe("5");
  });

  it("uses the group tag axis without preview-only parameters", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => json(page));
    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "token" });
    await spl.library.groups.tags("group-1", { q: "tag", ordering: "book_count", page: 2, pageSize: 50 });
    const tagsUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(tagsUrl.origin + tagsUrl.pathname).toBe("https://api.example/library/groups/group-1/tags/");
    expect(tagsUrl.searchParams.get("q")).toBe("tag");
    expect(tagsUrl.searchParams.get("ordering")).toBe("book_count");
    expect(tagsUrl.searchParams.get("page")).toBe("2");
    expect(tagsUrl.searchParams.get("page_size")).toBe("50");
    expect(tagsUrl.searchParams.has("include_preview_books")).toBe(false);
    expect(tagsUrl.searchParams.has("preview_limit")).toBe(false);
  });
});
