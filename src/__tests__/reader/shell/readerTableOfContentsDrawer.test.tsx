// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderTocItem } from "../../../features/reader/domain/ReaderDomain.Types";
import { TableOfContentsDrawer } from "../../../features/reader/shell/ReaderTableOfContentsDrawer.UI";
import { findCurrentTocItemKey } from "../../../features/reader/shell/ReaderTableOfContents.Presenter";

const toc: ReaderTocItem[] = [
  {
    id: "part-1",
    label: "Part One",
    href: "OPS/Text/part.xhtml",
    children: [
      { id: "chapter-1", label: "Chapter One", href: "OPS/Text/chapter.xhtml" },
      { id: "chapter-detail", label: "Chapter Detail", href: "OPS/Text/chapter.xhtml#detail" },
    ],
  },
  { id: "chapter-2", label: "Chapter Two", href: "OPS/Text/chapter-2.xhtml" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderDrawer(input?: {
  items?: ReaderTocItem[];
  currentHref?: string;
  onClose?: () => void;
  onPickItem?: (item: ReaderTocItem) => void;
}) {
  act(() => {
    root.render(
      <TableOfContentsDrawer
        open
        toc={input?.items ?? toc}
        currentHref={input?.currentHref}
        onClose={input?.onClose ?? vi.fn()}
        onPickItem={input?.onPickItem ?? vi.fn()}
      />,
    );
  });
}

function enterSearchQuery(value: string) {
  const input = container.querySelector<HTMLInputElement>('[aria-label="Search table of contents"]');
  expect(input).not.toBeNull();
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    valueSetter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("TableOfContentsDrawer", () => {
  it("renders nested entries, focuses search, marks the nearest current entry, and preserves selection", () => {
    const onPickItem = vi.fn();
    renderDrawer({ currentHref: "OPS/Text/chapter.xhtml#detail", onPickItem });

    const search = container.querySelector('[aria-label="Search table of contents"]');
    const nestedList = container.querySelector(".spTocListNested");
    const current = container.querySelector<HTMLButtonElement>('[aria-current="location"]');

    expect(document.activeElement).toBe(search);
    expect(nestedList?.textContent).toContain("Chapter One");
    expect(container.querySelector('[role="tree"]')).toBeNull();
    expect(current?.textContent).toBe("Chapter Detail");
    expect(current?.tagName).toBe("BUTTON");

    act(() => current?.click());
    expect(onPickItem).toHaveBeenCalledWith(toc[0].children?.[1]);
  });

  it("preserves matching branch context and shows the no-results state", () => {
    renderDrawer();

    enterSearchQuery("detail");
    expect(container.textContent).toContain("Part One");
    expect(container.textContent).toContain("Chapter Detail");
    expect(container.textContent).not.toContain("Chapter Two");

    enterSearchQuery("missing entry");
    expect(container.textContent).toContain("No matching contents entries.");
  });

  it("shows the empty state and closes on Escape", () => {
    const onClose = vi.fn();
    renderDrawer({ items: [], onClose });

    expect(container.textContent).toContain("No table of contents available.");
    expect(container.querySelector('[aria-label="Close table of contents"]')).not.toBeNull();

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("chooses the deepest matching entry when normalized hrefs overlap", () => {
    expect(findCurrentTocItemKey(toc, "OPS/Text/chapter.xhtml#detail")).toBe(
      "chapter-detail|OPS/Text/chapter.xhtml#detail|Chapter Detail",
    );
  });
});
