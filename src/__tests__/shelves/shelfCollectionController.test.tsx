// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SecondPassClient, Shelf } from "@secondpass/client";
import { useShelfCollection } from "../../features/shelves/ShelfCollection.Controller";
import { ShelvesPage } from "../../features/shelves/ShelvesPage.UI";

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useShelfCollection>;
let list: ReturnType<typeof vi.fn>;
let create: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let spl: SecondPassClient;
const shelf: Shelf = { id: "shelf-1", name: "Mine", owner_type: "user", can_edit: true };
const result = { results: [shelf], count: 1, next: null, previous: null };
function Harness({ ordering = "name", page = 1 }: { ordering?: "name" | "-item_count"; page?: number }) {
  state = useShelfCollection({ spl, ordering, page, pageSize: 20 });
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  list = vi.fn().mockResolvedValue(result);
  create = vi.fn().mockResolvedValue(shelf);
  remove = vi.fn().mockResolvedValue(undefined);
  spl = { shelves: { list, create, remove } } as unknown as SecondPassClient;
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

it("loads both scopes with route pagination and keeps old data during failed refresh and retry", async () => {
  await act(async () => root.render(<Harness page={2} />));
  for (const scope of ["personal", "shared"]) {
    expect(list).toHaveBeenCalledWith({ scope, includePreviewBooks: true, ordering: "name", page: 2, pageSize: 20 });
  }
  let reject!: (error: Error) => void;
  list.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  let pending!: Promise<void>;
  act(() => { pending = state.retry(); });
  expect(state.busy).toBe(true);
  expect(state.data?.personal).toEqual([shelf]);
  await act(async () => { reject(new Error("offline")); await pending; });
  expect(state.error).toBeInstanceOf(Error);
  expect(state.data?.personal).toEqual([shelf]);
  await act(async () => state.retry());
  expect(state.error).toBeNull();
  expect(state.busy).toBe(false);
});

it.each([false, true])("rejects stale collection success/failure (failure=%s) without settling the current load", async (failOld) => {
  let resolveOld!: (value: typeof result) => void;
  let rejectOld!: (error: Error) => void;
  let resolveNew!: (value: typeof result) => void;
  list.mockReturnValueOnce(new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; }));
  await act(async () => root.render(<Harness />));
  list.mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
  await act(async () => root.render(<Harness ordering="-item_count" />));
  await act(async () => {
    if (failOld) rejectOld(new Error("obsolete"));
    else resolveOld(result);
  });
  expect(state.busy).toBe(true);
  expect(state.data).toBeNull();
  expect(state.error).toBeNull();
  await act(async () => resolveNew({ ...result, results: [{ ...shelf, name: "Current" }] }));
  expect(state.data?.personal[0].name).toBe("Current");
  expect(state.busy).toBe(false);
});

it("retains failed creation drafts, then closes and refreshes after creation before clearing busy", async () => {
  await act(async () => root.render(<Harness />));
  act(() => state.beginCreate());
  act(() => state.changeCreateDraft({ name: "  New  ", description: "<p>Notes</p>", visibility: "listed" }));
  create.mockRejectedValueOnce(new Error("failed"));
  await act(async () => state.createShelf());
  expect(state.createOpen).toBe(true);
  expect(state.createDraft.name).toBe("  New  ");
  expect(state.mutationError).toBeTruthy();
  expect(state.mutationBusy).toBe(false);
  let resolve!: (value: typeof result) => void;
  list.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  let pending!: Promise<void>;
  await act(async () => { pending = state.createShelf(); });
  expect(create).toHaveBeenLastCalledWith({ name: "New", description: "<p>Notes</p>", visibility: "listed", owner_type: "user" });
  expect(state.createOpen).toBe(false);
  expect(state.createDraft.name).toBe("");
  expect(state.mutationBusy).toBe(true);
  await act(async () => { resolve(result); await pending; });
  expect(state.mutationBusy).toBe(false);
  expect(state.mutationError).toBeNull();
});

it("guards delete, preserves the menu on failure, and closes it before refreshing on success", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => root.render(<Harness />));
  await act(async () => state.deleteShelf({ ...shelf, owner_type: "group" }));
  expect(confirm).not.toHaveBeenCalled();
  await act(async () => state.deleteShelf(shelf));
  expect(remove).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  act(() => state.toggleMenu(shelf.id));
  remove.mockRejectedValueOnce(new Error("failed"));
  await act(async () => state.deleteShelf(shelf));
  expect(state.menuShelfId).toBe(shelf.id);
  expect(state.mutationError).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => state.deleteShelf(shelf));
  expect(remove).toHaveBeenLastCalledWith(shelf.id);
  expect(state.menuShelfId).toBeNull();
  expect(list).toHaveBeenCalledTimes(4);
});

it("binds the create dialog focus and dismissal without reloading the collection", async () => {
  await act(async () => root.render(<ShelvesPage connection={null} spl={spl} />));
  const opener = [...container.querySelectorAll("button")].find((node) => node.textContent === "Create personal shelf")!;
  await act(async () => { opener.focus(); opener.click(); });
  expect(container.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(list).toHaveBeenCalledTimes(2);
});

it("renders all supplied Shelf previews beside unchanged metadata", async () => {
  const previews = Array.from({ length: 7 }, (_, index) => ({
    id: `book-${index}`,
    title: `Preview ${index}`,
    cover_url: null,
  }));
  list.mockResolvedValue({ ...result, results: [{
    ...shelf,
    owner_user: { profile_id: "profile-1", username: "reader" },
    visibility: "listed",
    item_count: 7,
    preview_books: previews,
  }] });

  await act(async () => root.render(<ShelvesPage connection={null} spl={spl} />));

  const card = container.querySelector(".shelfCard")!;
  expect(card.querySelector(".shelfCardMain")?.textContent).toContain("Mine");
  const metadata = card.querySelector(".shelfCardMain")?.textContent;
  expect(metadata).toContain("<@reader>");
  expect(metadata).toContain("Public");
  expect(metadata).toContain("7 books");
  expect(card.querySelectorAll(".shelfCardRight .previewBookCoverTile")).toHaveLength(7);
  expect(card.querySelectorAll(".shelfCardRight .previewBookCoverButton")).toHaveLength(7);
});

it.each([
  ["create", "success"], ["create", "failure"],
  ["delete", "success"], ["delete", "failure"],
] as const)("ignores obsolete %s %s after the collection query changes", async (operation, outcome) => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(async () => root.render(<Harness />));
  act(() => state.changeCreateDraft({ name: "New", description: "", visibility: "private" }));
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const mutation = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  (operation === "create" ? create : remove).mockReturnValueOnce(mutation);
  let pending!: Promise<void>;
  act(() => { pending = operation === "create" ? state.createShelf() : state.deleteShelf(shelf); });
  await act(async () => root.render(<Harness ordering="-item_count" />));
  expect(state.mutationBusy).toBe(false);
  act(() => state.beginCreate());
  act(() => state.changeCreateDraft({ name: "Current draft", description: "", visibility: "private" }));
  await act(async () => {
    if (outcome === "success") resolve(); else reject(new Error("obsolete"));
    await pending;
  });
  expect(state.createOpen).toBe(true);
  expect(state.createDraft.name).toBe("Current draft");
  expect(state.mutationError).toBeNull();
  expect(list).toHaveBeenCalledTimes(4);
});

it("does not refresh using the previous client after a pending delete finishes", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(async () => root.render(<Harness />));
  let resolve!: () => void;
  remove.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
  let pending!: Promise<void>;
  act(() => { pending = state.deleteShelf(shelf); });
  const newList = vi.fn().mockResolvedValue({ ...result, results: [] });
  spl = { shelves: { list: newList } } as unknown as SecondPassClient;
  await act(async () => root.render(<Harness />));
  await act(async () => { resolve(); await pending; });
  expect(remove).toHaveBeenCalledExactlyOnceWith(shelf.id);
  expect(list).toHaveBeenCalledTimes(2);
  expect(newList).toHaveBeenCalledTimes(2);
  expect(state.data?.personal).toEqual([]);
});
