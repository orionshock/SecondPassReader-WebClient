// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LibraryAuthorRows } from "../../features/library/results/LibraryAuthorRows.UI";
import { LibrarySeriesRows } from "../../features/library/results/LibrarySeriesRows.UI";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it.each(["author", "series"] as const)("renders all %s previews and separates row and Book actions", (kind) => {
  const previewBooks = Array.from({ length: 8 }, (_, index) => ({ id: `book-${index}`, title: `Book ${index}`, coverUrl: null }));
  const onSelect = vi.fn();
  const onViewBook = vi.fn();
  const common = {
    busy: false, error: null, page: 1, pageSize: 20, connection: null,
    onViewBook, onPageChange: vi.fn(), onPageSizeChange: vi.fn(),
  };
  act(() => {
    if (kind === "author") {
      root.render(<LibraryAuthorRows {...common} data={{ count: 1, next: null, previous: null, results: [{ id: "author-1", name: "Author", sortName: "Author", biography: "", bookCount: 8, previewBooks }] }} onSelectAuthor={onSelect} />);
    } else {
      root.render(<LibrarySeriesRows {...common} data={{ count: 1, next: null, previous: null, results: [{ id: "series-1", name: "Series", sortName: "Series", summary: "", bookCount: 8, previewBooks }] }} onSelectSeries={onSelect} />);
    }
  });

  const card = container.querySelector<HTMLElement>(".libraryEntityCard")!;
  const metadataButton = card.querySelector<HTMLButtonElement>(".libraryEntityCardButton")!;
  const covers = card.querySelectorAll<HTMLButtonElement>(".previewBookCoverButton");
  expect(covers).toHaveLength(8);
  expect(metadataButton.tagName).toBe("BUTTON");
  expect(metadataButton.tabIndex).toBe(0);
  expect(metadataButton.getAttribute("aria-label")).toBe(kind === "author" ? "View books by Author" : "View books in Series");

  act(() => card.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(kind === "author" ? "author-1" : "series-1");
  onSelect.mockClear();

  act(() => { metadataButton.focus(); metadataButton.click(); });
  expect(document.activeElement).toBe(metadataButton);
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(kind === "author" ? "author-1" : "series-1");
  onSelect.mockClear();

  act(() => covers[0].click());
  expect(onViewBook).toHaveBeenCalledExactlyOnceWith("book-0");
  expect(onSelect).not.toHaveBeenCalled();
  expect(covers[0].getAttribute("aria-label")).toBe("View details for Book 0");
});
