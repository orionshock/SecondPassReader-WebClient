import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSecondPassClient } from "../index";

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "content-type": "application/json" },
});

const aggregate = { id: "tag-1", name: "Science Fiction", slug: "science-fiction", book_count: 84 };
const book = {
  id: "book-1",
  title: "Dune",
  sort_title: "Dune",
  subtitle: "",
  authors: [],
  series: null,
  catalog_tags: [],
  language: null,
  publisher: null,
  published_year: null,
  published_month: null,
  published_day: null,
  published_date_precision: "",
  cover_url: null,
  file_format: "epub",
};

describe("library catalog result aggregates", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("normalizes contextual tags on global and Group Book result pages", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => json({ count: 1, next: null, previous: null, catalog_tags: [aggregate], results: [book] }));
    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "token" });

    const global = await spl.library.books.list();
    const group = await spl.library.groups.books("group-1");

    expect(global.catalogTags).toEqual([{ id: "tag-1", name: "Science Fiction", slug: "science-fiction", bookCount: 84 }]);
    expect(group.catalogTags).toEqual(global.catalogTags);
    expect(global).not.toHaveProperty("catalog_tags");
  });

  it("normalizes contextual tags derived for Author and Series results", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(json({
        count: 1,
        next: null,
        previous: null,
        catalog_tags: [aggregate],
        results: [{ id: "author-1", name: "Frank Herbert", sort_name: "Herbert, Frank", biography: "", book_count: 2, preview_books: [] }],
      }))
      .mockResolvedValueOnce(json({
        count: 1,
        next: null,
        previous: null,
        catalog_tags: [aggregate],
        results: [{ id: "series-1", name: "Dune", sort_name: "Dune", summary: "", book_count: 2, preview_books: [] }],
      }));
    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "token" });

    expect((await spl.library.authors.list()).catalogTags?.[0]?.bookCount).toBe(84);
    expect((await spl.library.groups.series("group-1")).catalogTags?.[0]?.bookCount).toBe(84);
  });

  it("preserves present empty aggregates and absent metadata distinctly", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(json({ count: 0, next: null, previous: null, catalog_tags: [], results: [] }))
      .mockResolvedValueOnce(json({ count: 0, next: null, previous: null, results: [] }));
    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "token" });

    expect((await spl.library.search({ q: "missing" })).catalogTags).toEqual([]);
    expect((await spl.library.books.list()).catalogTags).toBeUndefined();
  });

  it("sends the selected tag through global and Group broad Book search", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => json({ count: 0, next: null, previous: null, catalog_tags: [], results: [] }));
    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "token" });

    await spl.library.search({ q: "space", tag: "science-fiction" });
    await spl.library.groups.search("group-1", { q: "space", tag: "science-fiction" });

    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get("tag")).toBe("science-fiction");
    expect(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get("tag")).toBe("science-fiction");
  });
});
