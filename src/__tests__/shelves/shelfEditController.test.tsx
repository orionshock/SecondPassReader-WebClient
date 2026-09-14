// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SecondPassClient, Shelf, ShelfItem } from "@secondpass/client";
import { useShelfEdit } from "../../features/shelves/ShelfEdit.Controller";

let root: Root;
let state: ReturnType<typeof useShelfEdit>;
let api: { get: ReturnType<typeof vi.fn>; items: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
let spl: SecondPassClient;
const shelf: Shelf = { id: "shelf-1", name: "Mine", description: "<p>Original</p>", owner_type: "user", can_edit: true, item_count: 3 };
const item: ShelfItem = { id: "item-1", shelf: "shelf-1", position: 1, book: { id: "book-1", title: "Book" } };
const firstPage = { results: [item, { ...item, id: "item-0", position: 0 }], next: "https://server/items/?page=2" };
function Harness({ shelfId = "shelf-1" }: { shelfId?: string }) {
  state = useShelfEdit({ spl, shelfId });
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  api = {
    get: vi.fn().mockResolvedValue(shelf), items: vi.fn().mockResolvedValue(firstPage),
    update: vi.fn().mockResolvedValue({ ...shelf, name: "Updated" }),
    updateItem: vi.fn().mockResolvedValue(item), removeItem: vi.fn().mockResolvedValue(undefined),
  };
  spl = { shelves: api } as unknown as SecondPassClient;
});
afterEach(() => { act(() => root.unmount()); vi.restoreAllMocks(); });

it("loads metadata before editable items, sorts pages, and resets on shelf identity changes", async () => {
  let resolve!: (value: Shelf) => void;
  api.get.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<Harness />));
  expect(state.busy).toBe(true);
  expect(api.items).not.toHaveBeenCalled();
  await act(async () => resolve(shelf));
  expect(state.items.map((entry) => entry.id)).toEqual(["item-0", "item-1"]);
  api.items.mockResolvedValueOnce({ results: [{ ...item, id: "item-2", position: 2 }], next: null });
  await act(async () => state.loadMore());
  expect(api.items).toHaveBeenLastCalledWith("shelf-1", { page: 2 });
  expect(state.items.map((entry) => entry.id)).toEqual(["item-0", "item-1", "item-2"]);
  act(() => state.editInfo());
  api.get.mockReturnValueOnce(new Promise(() => {}));
  await act(async () => root.render(<Harness shelfId="shelf-2" />));
  expect(state.items).toEqual([]);
  expect(state.shelf).toBeNull();
  expect(state.infoOpen).toBe(false);
});

it("does not load items or perform mutations on read-only shelves", async () => {
  api.get.mockResolvedValue({ ...shelf, owner_type: "group" });
  const confirm = vi.spyOn(window, "confirm");
  await act(async () => root.render(<Harness />));
  await act(async () => {
    await state.saveInfo();
    await state.moveItem(item, "up");
    await state.moveToPosition(item, 0);
    await state.removeItem(item);
  });
  expect(state.canEdit).toBe(false);
  expect(api.items).not.toHaveBeenCalled();
  expect(api.update).not.toHaveBeenCalled();
  expect(api.updateItem).not.toHaveBeenCalled();
  expect(api.removeItem).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});

it("retains info edits on failure, then accepts server metadata and closes without refreshing items", async () => {
  await act(async () => root.render(<Harness />));
  act(() => state.editInfo());
  act(() => state.changeInfo({ name: "  Updated  ", description: "<p>New</p>", visibility: "listed" }));
  expect(api.get).toHaveBeenCalledTimes(1);
  api.update.mockRejectedValueOnce(new Error("failed"));
  await act(async () => state.saveInfo());
  expect(state.infoOpen).toBe(true);
  expect(state.infoDraft.description).toBe("<p>New</p>");
  expect(state.mutationError).toBeTruthy();
  expect(state.infoBusy).toBe(false);
  await act(async () => state.saveInfo());
  expect(api.update).toHaveBeenLastCalledWith("shelf-1", { name: "Updated", description: "<p>New</p>", visibility: "listed" });
  expect(state.infoOpen).toBe(false);
  expect(state.infoDraft.description).toBe(shelf.description);
  expect(state.shelf?.name).toBe("Updated");
  expect(api.items).toHaveBeenCalledTimes(1);
  act(() => state.editInfo());
  act(() => state.cancelInfo());
  expect(state.mutationError).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(1);
});

it.each(["direction", "position", "remove"] as const)("waits for %s mutation before first-page refresh and retains the action flag until refresh completes", async (operation) => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(async () => root.render(<Harness />));
  let resolveMutation!: () => void;
  let resolveRefresh!: (value: typeof firstPage) => void;
  const mutation = new Promise<void>((done) => { resolveMutation = done; });
  api.updateItem.mockReturnValueOnce(mutation);
  api.removeItem.mockReturnValueOnce(mutation);
  api.items.mockReturnValueOnce(new Promise((done) => { resolveRefresh = done; }));
  let pending!: Promise<void>;
  act(() => {
    pending = operation === "direction" ? state.moveItem(item, "up")
      : operation === "position" ? state.moveToPosition(item, 0) : state.removeItem(item);
  });
  expect(state.mutationBusyId).toBe(item.id);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(state.items[1]).toEqual(item);
  if (operation === "remove") expect(api.removeItem).toHaveBeenCalledWith("shelf-1", item.id);
  else expect(api.updateItem).toHaveBeenCalledWith("shelf-1", item.id, operation === "direction" ? { move: "up" } : { position: 0 });
  await act(async () => resolveMutation());
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(state.mutationBusyId).toBe(item.id);
  await act(async () => { resolveRefresh({ ...firstPage, results: [] }); await pending; });
  expect(state.mutationBusyId).toBeNull();
  expect(state.items).toEqual([]);
});

it("retains items after mutation failure but clears shelf data after a failed post-mutation reload", async () => {
  await act(async () => root.render(<Harness />));
  api.updateItem.mockRejectedValueOnce(new Error("failed"));
  await act(async () => state.moveItem(item, "up"));
  expect(state.items).toHaveLength(2);
  expect(state.mutationError).toBeTruthy();
  expect(state.mutationBusyId).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(1);
  api.items.mockRejectedValueOnce(new Error("reload failed"));
  await act(async () => state.moveItem(item, "up"));
  expect(state.shelf).toBeNull();
  expect(state.items).toEqual([]);
  expect(state.error).toBeTruthy();
  expect(state.mutationError).toBeNull();
  expect(state.busy).toBe(false);
});

it("keeps items and pagination after load-more failure and does nothing on cancelled removal", async () => {
  await act(async () => root.render(<Harness />));
  api.items.mockRejectedValueOnce(new Error("failed"));
  await act(async () => state.loadMore());
  expect(state.items).toHaveLength(2);
  expect(state.nextUrl).toBe(firstPage.next);
  expect(state.loadMoreBusy).toBe(false);
  expect(state.mutationError).toBeTruthy();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => state.removeItem(item));
  expect(api.removeItem).not.toHaveBeenCalled();
});
