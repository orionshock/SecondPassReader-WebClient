import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CompactBook, SecondPassClient } from "@secondpass/client";
import { LibraryAxisTabs } from "../features/library/controls/LibraryAxisTabs.UI";
import { BookViewModeToggle } from "../features/library/display/BookViewModeControl.UI";
import { LibraryScopeSelect } from "../features/library/libraryScope/LibraryScopeSelect.UI";
import { CatalogTagRail } from "../features/library/catalogTags/CatalogTagRail.UI";
import { BookDetailModal } from "../features/library/BookDetailModal.UI";
import { AddToShelfMenu } from "../features/library/bookDetail/AddToShelfMenu.UI";

vi.mock("../features/library/catalogTags/CatalogTags.Controller", () => ({
  useCatalogTags: () => ({
    data: { results: [{ id: "1", slug: "fiction", name: "Fiction", bookCount: 3 }], previous: null, next: null },
    busy: false,
    error: null,
    previousPage: vi.fn(),
    nextPage: vi.fn(),
  }),
}));

const noop = () => undefined;

describe("Library accessibility semantics", () => {
  it("exposes axis tabs and their selected state", () => {
    const html = renderToStaticMarkup(
      <LibraryAxisTabs activeAxis="authors" onShowBooks={noop} onShowAuthors={noop} onShowSeries={noop} />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="library-axis-authors-tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="library-axis-results"');
  });

  it("labels the scope menu and exposes the selected scope", () => {
    const html = renderToStaticMarkup(
      <LibraryScopeSelect groups={[]} busy={false} error={null} onChange={noop} />,
    );
    expect(html).toContain('aria-label="Library scope: All Library"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-checked="true"');
  });

  it("exposes the active catalog tag and readable count", () => {
    const html = renderToStaticMarkup(
      <CatalogTagRail spl={{} as SecondPassClient} selectedSlug="fiction" onSelect={noop} />,
    );
    expect(html).toContain('aria-label="Catalog tags"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="3 books"');
  });

  it("prefers contextual catalog tags, including a present empty aggregate", () => {
    const contextual = [{ id: "2", slug: "science-fiction", name: "Science Fiction", bookCount: 84 }];
    const html = renderToStaticMarkup(
      <CatalogTagRail
        spl={{} as SecondPassClient}
        catalogResult={{ catalogTags: contextual }}
        selectedSlug="science-fiction"
        onSelect={noop}
      />,
    );
    expect(html).toContain("Science Fiction");
    expect(html).toContain('aria-label="84 books"');
    expect(html).not.toContain(">Fiction</span>");

    const emptyHtml = renderToStaticMarkup(
      <CatalogTagRail spl={{} as SecondPassClient} catalogResult={{ catalogTags: [] }} onSelect={noop} />,
    );
    expect(emptyHtml).not.toContain(">Fiction</span>");
  });

  it("exposes pressed state on book view buttons", () => {
    const html = renderToStaticMarkup(<BookViewModeToggle viewMode="grid" onChange={noop} />);
    expect(html).toMatch(/aria-pressed="false"[^>]*>List/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Grid/);
  });

  it("labels the book detail dialog and its close button", () => {
    const initialBook = { id: "7", title: "Accessible Book" } as CompactBook;
    const html = renderToStaticMarkup(
      <BookDetailModal
        profile={null} spl={null} bookId="7" initialBook={initialBook} onClose={noop}
        onOpenReader={noop} onViewSessions={noop} onViewAuthor={noop} onViewSeries={noop}
        onViewTag={noop} onManageShelves={noop} onManageOffline={noop} launchMessage={null} downloadState={{ phase: "idle" }}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="book-detail-dialog-title"');
    expect(html).toContain('aria-label="Close book details"');
  });

  it("exposes add-to-shelf menu state", () => {
    const html = renderToStaticMarkup(
      <AddToShelfMenu spl={{} as SecondPassClient} bookId="7" onManageShelves={noop} />,
    );
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('role="menu"');
  });
});
