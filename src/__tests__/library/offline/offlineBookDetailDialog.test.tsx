// @vitest-environment jsdom
import { act } from "react";
import type { BookDetail } from "@secondpass/client";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineBookDetailDialog } from "../../../features/library/bookDetail/offline/OfflineBookDetailDialog.UI";

const controllerFactory = vi.hoisted(() => vi.fn());

vi.mock("../../../features/library/bookDetail/offline/OfflineBookDetail.Controller", () => ({
  createOfflineBookDetailController: controllerFactory,
}));

let container: HTMLDivElement;
let root: Root;

describe("offline Book Detail dialog", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("shows cached local detail and only local-safe actions", async () => {
    const cachedBook = book();
    const removeAsset = vi.fn(async () => undefined);
    const snapshot = {
      status: "ready" as const,
      action: "idle" as const,
      message: null,
      detail: {
        bookId: "book-1",
        book: cachedBook,
        title: cachedBook.title,
        titleAvailable: true,
        subtitle: null,
        authors: "Author One",
        series: null,
        description: "Saved description",
        publisher: null,
        language: "en",
        format: "epub",
        assetBytes: 4,
        asset: { format: "epub" },
        availability: "available" as const,
        canOpenReader: true,
      },
    };
    controllerFactory.mockReturnValue({
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      start: () => () => undefined,
      removeAsset,
    });
    const onOpenReader = vi.fn();
    const onManageOffline = vi.fn();

    await act(async () => {
      root.render(
        <OfflineBookDetailDialog
          namespaceKey="account-a"
          bookId="book-1"
          onClose={() => undefined}
          onOpenReader={onOpenReader}
          onManageOffline={onManageOffline}
        />,
      );
    });

    expect(container.textContent).toContain("Saved book details");
    expect(container.textContent).toContain("Cached Book");
    expect(container.textContent).not.toContain("Reading sessions");
    expect(container.textContent).not.toContain("Make available offline");
    expect(container.querySelector('img[src="https://library.example/cover.jpg"]')).toBeNull();

    click("Open reader");
    click("Manage offline");
    click("Remove offline copy");

    expect(onOpenReader).toHaveBeenCalledWith(cachedBook);
    expect(onManageOffline).toHaveBeenCalledOnce();
    expect(removeAsset).toHaveBeenCalledOnce();
  });
});

function click(label: string): void {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  act(() => button?.click());
}

function book(): BookDetail {
  return {
    id: "book-1",
    title: "Cached Book",
    sortTitle: "Cached Book",
    subtitle: "",
    authors: [{ id: "author-1", name: "Author One" }],
    series: null,
    catalogTags: [],
    language: "en",
    publisher: "",
    publishedYear: null,
    publishedMonth: null,
    publishedDay: null,
    publishedDatePrecision: "",
    coverUrl: "https://library.example/cover.jpg",
    description: "Saved description",
    identifiers: [],
    groups: [],
    file: { format: "epub", checksum: "a".repeat(64), fileSize: 4, downloadUrl: "https://library.example/book.epub" },
  };
}
