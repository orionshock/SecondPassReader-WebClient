import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PreviewBookCoverStack } from "../features/library/display/PreviewBookCoverStack";
import {
  normalizePreviewBook,
  normalizePreviewBooks,
} from "../features/library/display/previewBooks";
import { LibraryAuthorRows } from "../features/library/results/LibraryAuthorRows";
import type { ConnectionProfile } from "../storage/connectionProfiles";

describe("preview books", () => {
  it("normalizes wire, null, and already-normalized cover URLs", () => {
    expect(normalizePreviewBook({ id: "book-1", title: "One", cover_url: "/covers/one.jpg" })).toEqual({
      id: "book-1",
      title: "One",
      coverUrl: "/covers/one.jpg",
    });
    expect(normalizePreviewBook({ id: "book-2", title: "Two", cover_url: null })).toEqual({
      id: "book-2",
      title: "Two",
      coverUrl: null,
    });
    expect(normalizePreviewBooks([{ id: 3, title: "Three", coverUrl: "/covers/three.jpg" }])).toEqual([
      { id: "3", title: "Three", coverUrl: "/covers/three.jpg" },
    ]);
  });

  it("renders normalized preview cover images", () => {
    const html = renderToStaticMarkup(createElement(PreviewBookCoverStack, {
      previewBooks: [{ id: "book-1", title: "Preview Book", coverUrl: "/covers/book-1.jpg" }],
      baseUrl: "https://library.example/app/",
    }));

    expect(html).toContain("previewBookCoverStack");
    expect(html).toContain('src="https://library.example/covers/book-1.jpg"');
    expect(html).toContain('alt="Preview Book"');
  });

  it("renders placeholders for empty previews and missing covers", () => {
    const empty = renderToStaticMarkup(createElement(PreviewBookCoverStack, { previewBooks: [] }));
    const missing = renderToStaticMarkup(createElement(PreviewBookCoverStack, {
      previewBooks: [{ id: "book-1", title: "Preview Book", coverUrl: null }],
    }));

    expect(empty).toContain("No books");
    expect(empty).toContain("previewBookCoverTileEmpty");
    expect(missing).toContain("No cover");
    expect(missing).not.toContain("<img");
  });

  it("renders author previews through the shared cover stack", () => {
    const html = renderToStaticMarkup(createElement(LibraryAuthorRows, {
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [{
          id: "author-1",
          name: "Author",
          sortName: "Author",
          biography: "",
          bookCount: 1,
          previewBooks: [{ id: "book-1", title: "Book", coverUrl: "/covers/book.jpg" }],
        }],
      },
      busy: false,
      error: null,
      page: 1,
      profile: profile(),
      onSelectAuthor: vi.fn(),
      onViewBook: vi.fn(),
      onPageChange: vi.fn(),
    }));

    expect(html).toContain("previewBookCoverStackCompact");
    expect(html).toContain('src="https://library.example/covers/book.jpg"');
  });
});

function profile(): ConnectionProfile {
  return {
    id: "profile-1",
    label: "Library",
    serverBaseUrl: "https://library.example",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}
