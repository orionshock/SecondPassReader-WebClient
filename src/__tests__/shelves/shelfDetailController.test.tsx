// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SecondPassClient, ShelfItem } from "@secondpass/client";
import { useShelfDetail } from "../../features/shelves/ShelfDetail.Controller";

let root: Root;
let state: ReturnType<typeof useShelfDetail>;
let get: ReturnType<typeof vi.fn>;
let items: ReturnType<typeof vi.fn>;
let spl: SecondPassClient | null;
const item: ShelfItem = { id: "item-1", shelf: "shelf-1", position: 0, book: { id: "book-1", title: "Book" } };
const firstPage = { results: [item], next: "https://server/items/?page=2" };
function Harness({ ordering = "position", page = 1 }: { ordering?: "position" | "title"; page?: number }) {
  state = useShelfDetail({ spl, shelfId: "shelf-1", ordering, page, pageSize: 50 });
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  get = vi.fn().mockResolvedValue({ id: "shelf-1", name: "Mine" });
  items = vi.fn().mockResolvedValue(firstPage);
  spl = { shelves: { get, items } } as unknown as SecondPassClient;
});
afterEach(() => act(() => root.unmount()));

it("loads route pagination and appends more books without re-fetching metadata", async () => {
  await act(async () => root.render(<Harness />));
  expect(items).toHaveBeenCalledWith("shelf-1", { page: 1, pageSize: 50, ordering: "position" });
  items.mockResolvedValueOnce({ results: [{ ...item, id: "item-2" }], next: null });
  await act(async () => state.loadMore());
  expect(items).toHaveBeenLastCalledWith("shelf-1", { page: 2, pageSize: 50, ordering: "position" });
  expect(state.items.map((entry) => entry.id)).toEqual(["item-1", "item-2"]);
  expect(get).toHaveBeenCalledTimes(1);
  expect(state.nextUrl).toBeNull();
});

it("retains old data when a changed ordering fails", async () => {
  await act(async () => root.render(<Harness />));
  items.mockRejectedValueOnce(new Error("offline"));
  await act(async () => root.render(<Harness ordering="title" page={3} />));
  expect(items).toHaveBeenLastCalledWith("shelf-1", { page: 3, pageSize: 50, ordering: "title" });
  expect(state.shelf?.name).toBe("Mine");
  expect(state.items).toEqual([item]);
  expect(state.error).toBeTruthy();
  expect(state.busy).toBe(false);
});

it.each([false, true])("rejects obsolete first-page success/failure (failure=%s)", async (failOld) => {
  let resolve!: (value: typeof firstPage) => void;
  let reject!: (error: Error) => void;
  items.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  await act(async () => root.render(<Harness />));
  items.mockResolvedValueOnce({ results: [{ ...item, id: "current" }], next: null });
  await act(async () => root.render(<Harness ordering="title" />));
  await act(async () => { if (failOld) reject(new Error("obsolete")); else resolve(firstPage); });
  expect(state.items[0].id).toBe("current");
  expect(state.error).toBeNull();
  expect(state.busy).toBe(false);
});

it.each([false, true])("invalidates old load-more results/errors when first-page loading starts (failure=%s)", async (failOld) => {
  await act(async () => root.render(<Harness />));
  let resolve!: (value: typeof firstPage) => void;
  let reject!: (error: Error) => void;
  items.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  let pending!: Promise<void>;
  act(() => { pending = state.loadMore(); });
  items.mockResolvedValueOnce({ results: [{ ...item, id: "current" }], next: null });
  await act(async () => root.render(<Harness ordering="title" />));
  await act(async () => {
    if (failOld) reject(new Error("obsolete")); else resolve(firstPage);
    await pending;
  });
  expect(state.items.map((entry) => entry.id)).toEqual(["current"]);
  expect(state.error).toBeNull();
});

it("keeps pagination available after failure and appends on retry", async () => {
  await act(async () => root.render(<Harness />));
  items.mockRejectedValueOnce(new Error("offline"));
  await act(async () => state.loadMore());
  expect(state.loadMoreBusy).toBe(false);
  expect(state.nextUrl).toBe(firstPage.next);
  expect(state.items).toEqual([item]);
  expect(state.error).toBeTruthy();
  await act(async () => state.loadMore());
  expect(state.error).toBeNull();
  expect(state.items).toHaveLength(2);
});

it.each(["success", "failure"])("settles invalidated load-more immediately and keeps a newer load-more busy when the old request ends in %s", async (outcome) => {
  await act(async () => root.render(<Harness />));
  let resolveOld!: (value: typeof firstPage) => void;
  let rejectOld!: (error: Error) => void;
  items.mockReturnValueOnce(new Promise((done, fail) => { resolveOld = done; rejectOld = fail; }));
  let oldPage!: Promise<void>;
  act(() => { oldPage = state.loadMore(); });
  expect(state.loadMoreBusy).toBe(true);
  await act(async () => root.render(<Harness ordering="title" />));
  expect(state.loadMoreBusy).toBe(false);
  let resolveNew!: (value: typeof firstPage) => void;
  items.mockReturnValueOnce(new Promise((done) => { resolveNew = done; }));
  let newPage!: Promise<void>;
  act(() => { newPage = state.loadMore(); });
  expect(state.loadMoreBusy).toBe(true);
  await act(async () => {
    if (outcome === "success") resolveOld(firstPage); else rejectOld(new Error("obsolete"));
    await oldPage;
  });
  expect(state.items).toEqual([item]);
  expect(state.error).toBeNull();
  expect(state.loadMoreBusy).toBe(true);
  await act(async () => { resolveNew({ ...firstPage, results: [{ ...item, id: "new-page" }] }); await newPage; });
  expect(state.items.map((entry) => entry.id)).toEqual(["item-1", "new-page"]);
  expect(state.loadMoreBusy).toBe(false);
});

it("invalidates pending requests and settles busy state on disconnect", async () => {
  await act(async () => root.render(<Harness />));
  let resolve!: (value: typeof firstPage) => void;
  items.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  let pending!: Promise<void>;
  act(() => { pending = state.loadMore(); });
  spl = null;
  await act(async () => root.render(<Harness />));
  expect(state.loadMoreBusy).toBe(false);
  await act(async () => { resolve(firstPage); await pending; });
  expect(state.items).toEqual([item]);
  expect(state.error).toBeNull();
});
