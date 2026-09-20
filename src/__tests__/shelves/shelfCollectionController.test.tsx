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
function Harness({ ordering = "name" }: { ordering?: "name" | "-item_count" }) {
  state = useShelfCollection({ spl, ordering });
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

it("loads both first pages and keeps the affected scope's old data during failed refresh and retry", async () => {
  await act(async () => root.render(<Harness />));
  for (const scope of ["personal", "shared"]) {
    expect(list).toHaveBeenCalledWith({ scope, includePreviewBooks: true, previewLimit: 24, ordering: "name", page: 1, pageSize: 20 });
  }
  let reject!: (error: Error) => void;
  list.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  let pending!: Promise<void>;
  act(() => { pending = state.personal.reload(); });
  expect(state.personal.busy).toBe(true);
  expect(state.personal.data?.results).toEqual([shelf]);
  expect(state.shared.data?.results).toEqual([shelf]);
  await act(async () => { reject(new Error("offline")); await pending; });
  expect(state.personal.error).toBeInstanceOf(Error);
  expect(state.shared.error).toBeNull();
  expect(state.personal.data?.results).toEqual([shelf]);
  await act(async () => state.personal.retry());
  expect(state.personal.error).toBeNull();
  expect(state.personal.busy).toBe(false);
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
  expect(state.personal.busy).toBe(true);
  expect(state.personal.data).toBeNull();
  expect(state.personal.error).toBeNull();
  await act(async () => resolveNew({ ...result, results: [{ ...shelf, name: "Current" }] }));
  expect(state.personal.data?.results[0]?.name).toBe("Current");
  expect(state.personal.busy).toBe(false);
});

it("pages personal and shared shelves independently in both directions", async () => {
  list.mockImplementation(({ scope, page }: { scope: string; page: number }) => Promise.resolve({
    count: 45,
    next: page < 3 ? "next" : null,
    previous: page > 1 ? "previous" : null,
    results: [{ ...shelf, id: `${scope}-${page}` }],
  }));
  await act(async () => root.render(<Harness />));
  await act(async () => state.personal.next());
  expect(state.personal.page).toBe(2);
  expect(state.shared.page).toBe(1);
  await act(async () => state.shared.next());
  expect(state.personal.page).toBe(2);
  expect(state.shared.page).toBe(2);
  await act(async () => state.personal.previous());
  expect(state.personal.page).toBe(1);
  expect(state.shared.page).toBe(2);
  expect(list.mock.calls.map(([query]) => [query.scope, query.page])).toEqual([
    ["personal", 1], ["shared", 1], ["personal", 2], ["shared", 2], ["personal", 1],
  ]);
  for (const [query] of list.mock.calls) {
    expect(query).toMatchObject({ ordering: "name", pageSize: 20, includePreviewBooks: true, previewLimit: 24 });
  }
});

it("ignores a stale page response after a newer request for that scope", async () => {
  let resolveOld!: (value: typeof result) => void;
  list.mockImplementation(({ scope, page }: { scope: string; page: number }) => {
    if (scope === "personal" && page === 2) return new Promise((resolve) => { resolveOld = resolve; });
    return Promise.resolve({ ...result, count: 21, next: "next", results: [{ ...shelf, name: "Current" }] });
  });
  await act(async () => root.render(<Harness />));
  act(() => state.personal.next());
  await act(async () => state.personal.reload());
  await act(async () => resolveOld({ ...result, results: [{ ...shelf, name: "Stale" }] }));
  expect(state.personal.page).toBe(1);
  expect(state.personal.data?.results[0]?.name).toBe("Current");
  expect(state.shared.data?.results[0]?.name).toBe("Current");
});

it("resets both pages on sort and ignores an older sorted page response", async () => {
  let resolveOld!: (value: typeof result) => void;
  list.mockImplementation(({ scope, page, ordering }: { scope: string; page: number; ordering: string }) => {
    if (scope === "personal" && page === 2 && ordering === "name") return new Promise((resolve) => { resolveOld = resolve; });
    return Promise.resolve({ ...result, count: 21, next: "next", results: [{ ...shelf, name: ordering }] });
  });
  await act(async () => root.render(<Harness />));
  await act(async () => state.shared.next());
  act(() => state.personal.next());
  await act(async () => root.render(<Harness ordering="-item_count" />));
  await act(async () => resolveOld({ ...result, results: [{ ...shelf, name: "Stale" }] }));
  expect(state.personal.page).toBe(1);
  expect(state.shared.page).toBe(1);
  expect(state.personal.data?.results[0]?.name).toBe("-item_count");
  expect(state.shared.data?.results[0]?.name).toBe("-item_count");
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ scope: "personal", ordering: "-item_count", page: 1, previewLimit: 24 }));
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ scope: "shared", ordering: "-item_count", page: 1, previewLimit: 24 }));
});

it("resets pages for a replacement client and rejects the previous client's response", async () => {
  let resolveOld!: (value: typeof result) => void;
  list.mockImplementation(({ scope, page }: { scope: string; page: number }) => {
    if (scope === "personal" && page === 2) return new Promise((resolve) => { resolveOld = resolve; });
    return Promise.resolve({ ...result, count: 21, next: "next" });
  });
  await act(async () => root.render(<Harness />));
  await act(async () => state.shared.next());
  act(() => state.personal.next());
  const replacementList = vi.fn().mockResolvedValue({ ...result, results: [{ ...shelf, name: "Replacement" }] });
  spl = { shelves: { list: replacementList } } as unknown as SecondPassClient;
  await act(async () => root.render(<Harness />));
  await act(async () => resolveOld({ ...result, results: [{ ...shelf, name: "Old client" }] }));
  expect(state.personal.page).toBe(1);
  expect(state.shared.page).toBe(1);
  expect(state.personal.data?.results[0]?.name).toBe("Replacement");
  expect(state.shared.data?.results[0]?.name).toBe("Replacement");
  expect(replacementList).toHaveBeenCalledWith(expect.objectContaining({ scope: "personal", page: 1 }));
  expect(replacementList).toHaveBeenCalledWith(expect.objectContaining({ scope: "shared", page: 1 }));
});

it("returns to the last valid page when a collection shrinks", async () => {
  let personalRequests = 0;
  list.mockImplementation(({ scope, page }: { scope: string; page: number }) => {
    if (scope === "shared") return Promise.resolve({ ...result, results: [] });
    personalRequests += 1;
    if (personalRequests === 1) return Promise.resolve({ ...result, count: 21, next: "next" });
    if (page === 2) return Promise.resolve({ ...result, count: 1, results: [] });
    return Promise.resolve(result);
  });
  await act(async () => root.render(<Harness />));
  await act(async () => state.personal.next());
  expect(state.personal.page).toBe(1);
  expect(state.personal.data?.results).toEqual([shelf]);
  expect(state.personal.data?.next).toBeNull();
  expect(list.mock.calls.filter(([query]) => query.scope === "personal").map(([query]) => query.page)).toEqual([1, 2, 1]);
});

it("shows scoped page status and hides controls for an empty or single-page section", async () => {
  list.mockImplementation(({ scope, page }: { scope: string; page: number }) => Promise.resolve(scope === "personal"
    ? { count: 41, next: "next", previous: page > 1 ? "previous" : null, results: [shelf] }
    : { count: 0, next: null, previous: null, results: [] }));
  await act(async () => root.render(<ShelvesPage connection={null} spl={spl} />));
  const personalPager = container.querySelector('nav[aria-label="My shelves pages"]')!;
  expect(personalPager.textContent).toContain("Page 1");
  expect(personalPager.textContent).toContain("41 shelves");
  expect(personalPager.querySelector("button")?.disabled).toBe(true);
  expect(personalPager.querySelector("button")?.getAttribute("aria-label")).toBe("Previous page of My shelves");
  expect(personalPager.querySelectorAll("button")[1]?.getAttribute("aria-label")).toBe("Next page of My shelves");
  expect(container.querySelector('nav[aria-label="Shared shelves pages"]')).toBeNull();
  expect(container.textContent).toContain("No shared shelves.");
  await act(async () => personalPager.querySelectorAll("button")[1]!.click());
  expect(container.querySelector('nav[aria-label="My shelves pages"]')?.textContent).toContain("Page 2");
  expect(container.querySelector('nav[aria-label="Shared shelves pages"]')).toBeNull();
});

it("keeps a successful section visible when the other section fails", async () => {
  list.mockImplementation(({ scope }: { scope: string }) => scope === "personal"
    ? Promise.reject(new Error("personal unavailable"))
    : Promise.resolve({ ...result, results: [{ ...shelf, id: "shared-shelf", name: "Shared result" }] }));
  await act(async () => root.render(<ShelvesPage connection={null} spl={spl} />));
  const personalSection = container.querySelector('section[aria-labelledby="personal-shelves-title"]')!;
  const sharedSection = container.querySelector('section[aria-labelledby="shared-shelves-title"]')!;
  expect(personalSection.textContent).toContain("Couldn't load shelves.");
  expect(sharedSection.textContent).toContain("Shared result");
  expect(sharedSection.textContent).not.toContain("Couldn't load shelves.");
});

it("shows both empty messages without single-page controls", async () => {
  list.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  await act(async () => root.render(<ShelvesPage connection={null} spl={spl} />));
  expect(container.textContent).toContain("No personal shelves.");
  expect(container.textContent).toContain("No shared shelves.");
  expect(container.querySelector('nav[aria-label$="shelves pages"]')).toBeNull();
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
  expect(container.querySelector('nav[aria-label="My shelves pages"]')).toBeNull();
  expect(container.querySelector('nav[aria-label="Shared shelves pages"]')).toBeNull();
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
  expect(state.personal.data?.results).toEqual([]);
});

it("does not refresh an old page when a pending delete finishes after paging", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  list.mockImplementation(({ page }: { page: number }) => Promise.resolve({
    ...result, count: 21, next: page === 1 ? "next" : null, previous: page === 2 ? "previous" : null,
  }));
  await act(async () => root.render(<Harness />));
  let resolve!: () => void;
  remove.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
  let pending!: Promise<void>;
  act(() => { pending = state.deleteShelf(shelf); });
  await act(async () => state.personal.next());
  await act(async () => { resolve(); await pending; });
  expect(state.personal.page).toBe(2);
  expect(state.shared.page).toBe(1);
  expect(list.mock.calls.map(([query]) => [query.scope, query.page])).toEqual([
    ["personal", 1], ["shared", 1], ["personal", 2],
  ]);
});
