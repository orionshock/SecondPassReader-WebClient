// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LibrarySearchControls } from "../../features/library/controls/LibrarySearchControls.UI";
import { LibraryBooksResults } from "../../features/library/results/LibraryBooksResults.UI";
import { LibraryAuthorRows } from "../../features/library/results/LibraryAuthorRows.UI";
import { LibrarySeriesRows } from "../../features/library/results/LibrarySeriesRows.UI";

it("keeps search input and Search button in the search row and puts page size in the Library pager", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const onSearch = vi.fn();
  const onPageSizeChange = vi.fn();
  act(() => root.render(
    <>
      <LibrarySearchControls draft="Dune" placeholder="Search books" onDraftChange={vi.fn()} onSearch={onSearch} />
      <LibraryBooksResults
        data={{ count: 26, next: "next", previous: null, results: [] }}
        busy={false}
        page={1}
        pageSize={20}
        viewMode="list"
        selectedBookId={null}
        onViewBook={vi.fn()}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />
    </>,
  ));
  const searchRow = container.querySelector(".librarySearchSection")!;
  expect(searchRow.querySelectorAll("input")).toHaveLength(1);
  expect(searchRow.querySelectorAll("button")).toHaveLength(1);
  expect(searchRow.querySelector("select")).toBeNull();
  expect(container.querySelectorAll(".collectionPager")).toHaveLength(2);
  expect(container.querySelector(".collectionPagerStatus")?.textContent).toContain("Page 1 of 2");
  const select = container.querySelector<HTMLSelectElement>(".collectionPagerPageSize select")!;
  expect(select.value).toBe("20");
  act(() => {
    searchRow.querySelector<HTMLButtonElement>("button")!.click();
    select.value = "50";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onSearch).toHaveBeenCalledTimes(1);
  expect(onPageSizeChange).toHaveBeenCalledWith(50);
  act(() => root.unmount());
});

it.each(["authors", "series"] as const)("places the %s pager before entity rows", (kind) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const common = {
    busy: false,
    error: null,
    page: 1,
    pageSize: 20,
    connection: null,
    onViewBook: vi.fn(),
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  };
  act(() => root.render(kind === "authors"
    ? <LibraryAuthorRows {...common} data={{ count: 1, next: null, previous: null, results: [{ id: "a1", name: "Author", bookCount: 1, previewBooks: [] }] } as never} onSelectAuthor={vi.fn()} />
    : <LibrarySeriesRows {...common} data={{ count: 1, next: null, previous: null, results: [{ id: "s1", name: "Series", bookCount: 1, previewBooks: [] }] } as never} onSelectSeries={vi.fn()} />));
  const pager = container.querySelector(".collectionPager")!;
  const rows = container.querySelector(".libraryEntityList")!;
  expect(pager.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(pager.querySelector(".collectionPagerPageSize select")).not.toBeNull();
  act(() => root.unmount());
});
