import { describe, expect, it, vi } from "vitest";
import type { SecondPassClient } from "@secondpass/client";
import { loadRecentReading, loadSessionsPage } from "../features/reader/ReaderMarginalia.Queries";

function fakeClient() {
  return {
    marginalia: {
      books: { sessions: vi.fn().mockResolvedValue({ context: { book: {} }, count: 0, next: null, previous: null, results: [] }) },
      sessions: {
        recent: vi.fn().mockResolvedValue({ results: [] }),
        list: vi.fn().mockResolvedValue({ count: 0, next: null, previous: null, results: [] }),
      },
    },
  } as unknown as SecondPassClient;
}

describe("Reader marginalia requests", () => {
  it("loads Home recent reading from marginalia", async () => {
    const spl = fakeClient();
    await loadRecentReading(spl);
    expect(spl.marginalia.sessions.recent).toHaveBeenCalledWith({ limit: 10 });
  });

  it("uses global or book-scoped marginalia session lists", async () => {
    const spl = fakeClient();
    await loadSessionsPage({ spl, page: 1, pageSize: 20, status: "active", q: "notes" });
    await loadSessionsPage({ spl, bookId: "book-1", page: 2, pageSize: 50, status: "closed" });
    expect(spl.marginalia.sessions.list).toHaveBeenCalledWith({ status: "active", q: "notes", page: 1, pageSize: 20 });
    expect(spl.marginalia.books.sessions).toHaveBeenCalledWith("book-1", { status: "closed", q: undefined, page: 2, pageSize: 50 });
  });
});
