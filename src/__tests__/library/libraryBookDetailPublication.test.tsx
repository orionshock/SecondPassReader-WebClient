// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { BookDetail, SecondPassClient } from "@secondpass/client";
import { BookDetailModal } from "../../features/library/BookDetailModal.UI";

const bookDetailPanel = vi.hoisted(() => vi.fn(() => null));

vi.mock("../../features/library/BookDetailPanel.UI", () => ({ BookDetailPanel: bookDetailPanel }));
vi.mock("../../features/library/bookDetail/BookOfflineAvailability.Controller", () => ({
  useBookOfflineAvailabilityController: () => ({ status: "unavailable" }),
}));

it("does not publish a pending Book Detail after eligibility is lost", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement("div"));
  const pending = deferred<BookDetail>();
  const client = {
    library: { books: { get: vi.fn(() => pending.promise) } },
    marginalia: { books: { get: vi.fn(() => new Promise(() => {})) } },
  } as unknown as SecondPassClient;

  await act(async () => root.render(<Harness spl={client} />));
  await act(async () => root.render(<Harness spl={null} />));
  await act(async () => pending.resolve({ id: "book-1", title: "Obsolete detail" } as BookDetail));

  expect(bookDetailPanel).not.toHaveBeenCalled();
  act(() => root.unmount());
});

function Harness({ spl }: { spl: SecondPassClient | null }) {
  return (
    <BookDetailModal
      profile={null}
      spl={spl}
      bookId="book-1"
      initialBook={null}
      onClose={() => undefined}
      onOpenReader={() => undefined}
      onViewSessions={() => undefined}
      onViewAuthor={() => undefined}
      onViewSeries={() => undefined}
      onViewTag={() => undefined}
      onManageShelves={() => undefined}
      onManageOffline={() => undefined}
      launchMessage={null}
      downloadState={{ phase: "idle" }}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
