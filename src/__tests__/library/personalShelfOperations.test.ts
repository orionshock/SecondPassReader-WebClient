import { describe, expect, it, vi } from "vitest";
import type { SecondPassClient, Shelf } from "@secondpass/client";
import {
  addBookToPersonalShelf,
  loadPersonalShelves,
} from "../../features/library/bookDetail/PersonalShelf.Actions";

describe("personal shelf operations", () => {
  it("marks a successful add as added without reconciliation", async () => {
    const api = shelfApi({ addItem: vi.fn().mockResolvedValue(undefined) });

    await expect(addBookToPersonalShelf({ spl: api.spl, shelfId: "shelf-1", bookId: "book-1" }))
      .resolves.toEqual({ added: true });

    expect(api.addItem).toHaveBeenCalledWith("shelf-1", { book: "book-1" });
    expect(api.list).not.toHaveBeenCalled();
  });

  it("treats an ambiguous add failure as success when refreshed membership is present", async () => {
    const api = shelfApi({
      addItem: vi.fn().mockRejectedValue(new Error("Connection closed")),
      pages: [page([shelf("shelf-1")])],
    });

    await expect(addBookToPersonalShelf({ spl: api.spl, shelfId: "shelf-1", bookId: "book-1" }))
      .resolves.toEqual({ added: true });

    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ scope: "personal", book: "book-1" }));
  });

  it("returns safe recovery guidance when refreshed membership is still missing", async () => {
    const api = shelfApi({
      addItem: vi.fn().mockRejectedValue(new Error("Permission denied")),
      pages: [page([shelf("another-shelf")])],
    });

    const result = await addBookToPersonalShelf({ spl: api.spl, shelfId: "shelf-1", bookId: "book-1" });
    expect(result).toMatchObject({ added: false });
    if (result.added) throw new Error("Expected failed shelf addition.");
    expect(result.message).not.toContain("Permission denied");
  });

  it("returns safe recovery guidance when membership refresh also fails", async () => {
    const api = shelfApi({
      addItem: vi.fn().mockRejectedValue(new Error("Original add failure")),
      list: vi.fn().mockRejectedValue(new Error("Refresh failure")),
    });

    const result = await addBookToPersonalShelf({ spl: api.spl, shelfId: "shelf-1", bookId: "book-1" });
    expect(result).toMatchObject({ added: false });
    if (result.added) throw new Error("Expected failed shelf addition.");
    expect(result.message).not.toContain("Original add failure");
    expect(result.message).not.toContain("Refresh failure");
  });

  it("loads every personal shelf page before returning targets", async () => {
    const api = shelfApi({
      pages: [
        page([shelf("shelf-1")], "https://library.example/shelves?page=2"),
        page([shelf("shelf-2")]),
      ],
    });

    await expect(loadPersonalShelves(api.spl)).resolves.toEqual([shelf("shelf-1"), shelf("shelf-2")]);
    expect(api.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ scope: "personal", page: 1, pageSize: 100 }));
    expect(api.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ scope: "personal", page: 2, pageSize: 100 }));
  });
});

function shelf(id: string): Shelf {
  return { id, name: id, owner_type: "user", can_edit: true };
}

function page(results: Shelf[], next: string | null = null) {
  return { count: results.length, next, previous: null, results };
}

function shelfApi(overrides: {
  addItem?: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
  pages?: Array<ReturnType<typeof page>>;
} = {}) {
  const addItem = overrides.addItem ?? vi.fn();
  const list = overrides.list ?? vi.fn();
  for (const result of overrides.pages ?? []) list.mockResolvedValueOnce(result);
  const spl = { shelves: { addItem, list } } as unknown as SecondPassClient;
  return { spl, addItem, list };
}
