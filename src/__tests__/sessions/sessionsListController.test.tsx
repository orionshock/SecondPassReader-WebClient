// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SecondPassClient } from "@secondpass/client";
import { useSessionsList } from "../../features/sessions/SessionsList.Controller";
import { sessionListItemFixture } from "./SessionTest.Fixtures";

let root: Root;
let state: ReturnType<typeof useSessionsList>;
let list: ReturnType<typeof vi.fn>;
let bookSessions: ReturnType<typeof vi.fn>;
let spl: SecondPassClient;
const page = { count: 2, next: "next", previous: null, results: [sessionListItemFixture()] };
function Harness({ bookId, searchQuery }: { bookId?: string; searchQuery?: string }) {
  state = useSessionsList({ spl, bookId, searchQuery });
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  list = vi.fn().mockResolvedValue(page);
  bookSessions = vi.fn().mockResolvedValue(page);
  spl = { marginalia: { sessions: { list }, books: { sessions: bookSessions } } } as unknown as SecondPassClient;
});
afterEach(() => act(() => root.unmount()));

it("loads the route query, keeps draft edits local, and reloads page one for filter/page-size changes", async () => {
  await act(async () => root.render(<Harness searchQuery="  saved query  " />));
  expect(list).toHaveBeenLastCalledWith({ status: undefined, q: "saved query", page: 1, pageSize: 20 });
  act(() => state.changeSearchDraft("unsubmitted"));
  expect(list).toHaveBeenCalledTimes(1);
  await act(async () => state.changeFilter("closed"));
  expect(list).toHaveBeenLastCalledWith({ status: "closed", q: "saved query", page: 1, pageSize: 20 });
  await act(async () => state.nextPage());
  expect(state.page).toBe(2);
  await act(async () => state.changePageSize(50));
  expect(list).toHaveBeenLastCalledWith({ status: "closed", q: "saved query", page: 1, pageSize: 50 });
  expect(state.page).toBe(1);
  await act(async () => root.render(<Harness bookId=" book-1 " searchQuery="new query" />));
  expect(bookSessions).toHaveBeenLastCalledWith("book-1", { status: "closed", q: "new query", page: 1, pageSize: 50 });
  expect(state.searchDraft).toBe("new query");
});

it("retains the current page during pagination, clears results on failure, and reloads on query changes", async () => {
  await act(async () => root.render(<Harness />));
  let reject!: (error: Error) => void;
  list.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  let pending!: Promise<void>;
  act(() => { pending = state.nextPage(); });
  expect(state.busy).toBe(true);
  expect(state.data).toEqual(page);
  expect(state.page).toBe(1);
  await act(async () => { reject(new Error("offline")); await pending; });
  expect(state.busy).toBe(false);
  expect(state.data).toBeNull();
  expect(state.error).toBeInstanceOf(Error);
  list.mockReturnValueOnce(new Promise(() => {}));
  await act(async () => root.render(<Harness searchQuery="retry via query" />));
  expect(state.busy).toBe(true);
  expect(state.error).toBeNull();
  expect(state.data).toBeNull();
});

it("clears existing results while a changed filter loads", async () => {
  await act(async () => root.render(<Harness />));
  list.mockReturnValueOnce(new Promise(() => {}));
  await act(async () => state.changeFilter("active"));
  expect(state.data).toBeNull();
  expect(state.page).toBe(1);
  expect(state.busy).toBe(true);
});

it.each(["success", "failure"])("ignores old query %s after a newer query succeeds", async (outcome) => {
  let resolve!: (value: typeof page) => void;
  let reject!: (error: Error) => void;
  list.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  await act(async () => root.render(<Harness searchQuery="old" />));
  const current = { ...page, results: [sessionListItemFixture({ name: "New query" })] };
  list.mockResolvedValueOnce(current);
  await act(async () => root.render(<Harness searchQuery="new" />));
  await act(async () => { if (outcome === "success") resolve(page); else reject(new Error("obsolete")); });
  expect(state.data).toEqual(current);
  expect(state.error).toBeNull();
  expect(state.busy).toBe(false);
});

it("invalidates pending pagination on filter change without settling the new filter's load", async () => {
  await act(async () => root.render(<Harness />));
  let resolveOld!: (value: typeof page) => void;
  let resolveNew!: (value: typeof page) => void;
  list.mockReturnValueOnce(new Promise((done) => { resolveOld = done; }));
  let pending!: Promise<void>;
  act(() => { pending = state.nextPage(); });
  list.mockReturnValueOnce(new Promise((done) => { resolveNew = done; }));
  await act(async () => state.changeFilter("closed"));
  await act(async () => { resolveOld(page); await pending; });
  expect(state.data).toBeNull();
  expect(state.page).toBe(1);
  expect(state.busy).toBe(true);
  await act(async () => resolveNew(page));
  expect(state.busy).toBe(false);
});

it("rejects the old client's result after a client replacement", async () => {
  let resolve!: (value: typeof page) => void;
  list.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<Harness />));
  const current = { ...page, results: [] };
  spl = { marginalia: { sessions: { list: vi.fn().mockResolvedValue(current) } } } as unknown as SecondPassClient;
  await act(async () => root.render(<Harness />));
  await act(async () => resolve(page));
  expect(state.data).toEqual(current);
});
