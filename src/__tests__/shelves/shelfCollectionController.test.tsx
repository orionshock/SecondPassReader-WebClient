// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PaginatedShelfResponse, SecondPassClient, Shelf } from "@secondpass/client";
import { useShelfCollection, type ShelfScope } from "../../features/shelves/ShelfCollection.Controller";
import { ShelvesPage } from "../../features/shelves/ShelvesPage.UI";

const shelf: Shelf = { id: "shelf-1", name: "Mine", owner_type: "user", can_edit: true };
const page = (scope: ShelfScope, number = 1, count = 1): PaginatedShelfResponse => ({
  count,
  next: number * 20 < count ? "next" : null,
  previous: number > 1 ? "previous" : null,
  results: [{ ...shelf, id: `${scope}-${number}`, name: `${scope} page ${number}` }],
});
const empty: PaginatedShelfResponse = { count: 0, next: null, previous: null, results: [] };

let root: Root;
let container: HTMLDivElement;
let list: ReturnType<typeof vi.fn>;
let create: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let spl: SecondPassClient;
let state: ReturnType<typeof useShelfCollection>;

function Harness({ activeScope = "personal", q = "", ordering = "name" }: {
  activeScope?: ShelfScope;
  q?: string;
  ordering?: "name" | "-item_count";
}) {
  state = useShelfCollection({ spl, q, ordering, activeScope });
  return null;
}

function PageHarness({ ordering, initialQ = "", onChangeOrdering, onCommitSearch }: {
  ordering?: string;
  initialQ?: string;
  onChangeOrdering?: (ordering: string) => void;
  onCommitSearch?: (q: string) => void;
}) {
  const [scope, setScope] = useState<ShelfScope>("personal");
  const [q, setQ] = useState(initialQ);
  return <ShelvesPage connection={null} spl={spl} scope={scope} q={q} ordering={ordering} onChangeScope={(next) => { setScope(next); setQ(""); }} onCommitSearch={(next) => { onCommitSearch?.(next); setQ(next); }} onChangeOrdering={onChangeOrdering} />;
}

async function renderPage(ordering?: string, onChangeOrdering?: (ordering: string) => void, initialQ?: string, onCommitSearch?: (q: string) => void) {
  await act(async () => root.render(<PageHarness ordering={ordering} initialQ={initialQ} onChangeOrdering={onChangeOrdering} onCommitSearch={onCommitSearch} />));
}

async function selectScope(label: string) {
  await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  list = vi.fn().mockImplementation(({ scope, page: number }: { scope: ShelfScope; page: number }) => Promise.resolve(page(scope, number)));
  create = vi.fn().mockResolvedValue(shelf);
  remove = vi.fn().mockResolvedValue(undefined);
  spl = { shelves: { list, create, remove } } as unknown as SecondPassClient;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  window.location.hash = "";
});

it("defaults to Personal and loads each server scope only when selected", async () => {
  await renderPage();
  expect(container.querySelector('button[aria-label="Personal"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector('button[aria-label="Shared by Others"] .material-symbols-outlined')?.textContent).toBe("share");
  expect(container.querySelector('button[aria-label="Group Shelves"] .material-symbols-outlined')?.textContent).toBe("group_work");
  expect(list).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledWith({ scope: "personal", page: 1, pageSize: 20, ordering: "name", includePreviewBooks: true, previewLimit: 24 });
  await selectScope("Shared by Others");
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "shared", page: 1, previewLimit: 24 }));
  await selectScope("Group Shelves");
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "group", page: 1, previewLimit: 24 }));
  expect(list).toHaveBeenCalledTimes(3);
  expect(container.querySelector('button[aria-label="Group Shelves"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelectorAll(".shelfCard")).toHaveLength(1);
  expect(container.textContent).toContain("group page 1");
  expect(container.textContent).not.toContain("shared page 1");
});

it("preserves each scope's page and results when switching selectors", async () => {
  list.mockImplementation(({ scope, page: number }: { scope: ShelfScope; page: number }) => Promise.resolve(page(scope, number, 45)));
  await renderPage();
  await act(async () => container.querySelector<HTMLButtonElement>('nav[aria-label="Personal pages"] button[aria-label="Next page of Personal"]')!.click());
  expect(container.textContent).toContain("personal page 2");
  await selectScope("Shared by Others");
  await act(async () => container.querySelector<HTMLButtonElement>('nav[aria-label="Shared by Others pages"] button[aria-label="Next page of Shared by Others"]')!.click());
  await selectScope("Group Shelves");
  expect(container.textContent).toContain("group page 1");
  await selectScope("Personal");
  expect(container.textContent).toContain("personal page 2");
  expect(container.querySelector('nav[aria-label="Personal pages"]')?.textContent).toContain("Page 2 of 3");
  await act(async () => container.querySelector<HTMLButtonElement>('nav[aria-label="Personal pages"] button[aria-label="Previous page of Personal"]')!.click());
  expect(container.textContent).toContain("personal page 1");
  await selectScope("Shared by Others");
  expect(container.textContent).toContain("shared page 2");
  expect(list.mock.calls.map(([query]) => [query.scope, query.page])).toEqual([
    ["personal", 1], ["personal", 2], ["shared", 1], ["shared", 2], ["group", 1], ["personal", 1],
  ]);
  for (const [query] of list.mock.calls) expect(query).toMatchObject({ includePreviewBooks: true, previewLimit: 24 });
});

it("keeps the displayed scope until an uncached scope has a result", async () => {
  let resolveShared!: (value: PaginatedShelfResponse) => void;
  let resolveGroup!: (value: PaginatedShelfResponse) => void;
  list.mockImplementation(({ scope }: { scope: ShelfScope }) => {
    if (scope === "shared") return new Promise<PaginatedShelfResponse>((resolve) => { resolveShared = resolve; });
    if (scope === "group") return new Promise<PaginatedShelfResponse>((resolve) => { resolveGroup = resolve; });
    return Promise.resolve(page(scope));
  });
  await renderPage();

  await selectScope("Shared by Others");
  expect(container.textContent).toContain("personal page 1");
  expect(container.textContent).not.toContain("Loading shared by others shelves...");
  expect(container.querySelector('nav[aria-label="Personal pages"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="Shared by Others"]')?.getAttribute("aria-busy")).toBe("true");
  await act(async () => resolveShared(page("shared")));
  expect(container.textContent).toContain("shared page 1");
  expect(container.textContent).not.toContain("personal page 1");

  await selectScope("Group Shelves");
  expect(container.textContent).toContain("shared page 1");
  expect(container.textContent).not.toContain("Loading group shelves...");
  await act(async () => resolveGroup(page("group")));
  expect(container.textContent).toContain("group page 1");
  await selectScope("Personal");
  expect(container.textContent).toContain("personal page 1");
  expect(list.mock.calls.filter(([query]) => query.scope === "personal")).toHaveLength(1);
});

it("keeps last-good rows visible while the active scope loads another page", async () => {
  let resolveNext!: (value: PaginatedShelfResponse) => void;
  list.mockImplementation(({ scope, page: number }: { scope: ShelfScope; page: number }) => number === 2
    ? new Promise<PaginatedShelfResponse>((resolve) => { resolveNext = resolve; })
    : Promise.resolve(page(scope, number, 25)));
  await renderPage();
  act(() => container.querySelector<HTMLButtonElement>('nav[aria-label="Personal pages"] button[aria-label="Next page of Personal"]')!.click());
  expect(container.textContent).toContain("personal page 1");
  expect(container.textContent).not.toContain("Loading page 2...");
  await act(async () => resolveNext(page("personal", 2, 25)));
  expect(container.textContent).toContain("personal page 2");
  expect(container.textContent).not.toContain("personal page 1");
});

it("keeps the current Shelf rows visible until a new sort order arrives", async () => {
  let resolveSorted!: (value: PaginatedShelfResponse) => void;
  list.mockImplementation(({ scope, ordering }: { scope: ShelfScope; ordering: string }) => ordering === "-item_count"
    ? new Promise<PaginatedShelfResponse>((resolve) => { resolveSorted = resolve; })
    : Promise.resolve(page(scope, 1, 25)));
  await renderPage("name");
  expect(container.textContent).toContain("personal page 1");

  await renderPage("-item_count");
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "personal", ordering: "-item_count", page: 1, previewLimit: 24 }));
  expect(container.textContent).toContain("personal page 1");
  expect(container.textContent).not.toContain("Loading");
  expect(container.querySelector('.shelfCollectionPager .orderingControlButton[title="Most books"]')?.getAttribute("aria-pressed")).toBe("true");

  await act(async () => resolveSorted({ ...page("personal", 1, 25), results: [{ ...shelf, name: "Most books first" }] }));
  expect(container.textContent).toContain("Most books first");
  expect(container.textContent).not.toContain("personal page 1");
});

it("keeps submitted q through paging and sorting while resetting each changed query to page 1", async () => {
  list.mockImplementation(({ scope, page: number, q }: { scope: ShelfScope; page: number; q?: string }) =>
    Promise.resolve({ ...page(scope, number, 45), results: [{ ...shelf, name: q ? `${q} ${number}` : `all ${number}` }] }));
  await act(async () => root.render(<Harness q="history" />));
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "personal", q: "history", page: 1 }));
  await act(async () => state.pages.personal.next());
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "history", page: 2 }));

  await act(async () => root.render(<Harness q="history" ordering="-item_count" />));
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "history", ordering: "-item_count", page: 1 }));
  await act(async () => root.render(<Harness q="memoir" ordering="-item_count" />));
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "memoir", ordering: "-item_count", page: 1 }));
});

it.each([
  ["an old unfiltered", "", "history"],
  ["an old searched", "history", "memoir"],
])("does not let %s response replace the current query", async (_label, oldQ, currentQ) => {
  let resolveOld!: (value: PaginatedShelfResponse) => void;
  list.mockImplementation(({ q }: { q?: string }) => (q ?? "") === oldQ
    ? new Promise<PaginatedShelfResponse>((resolve) => { resolveOld = resolve; })
    : Promise.resolve({ ...page("personal"), results: [{ ...shelf, name: currentQ }] }));
  await act(async () => root.render(<Harness q={oldQ} />));
  await act(async () => root.render(<Harness q={currentQ} />));
  expect(state.pages.personal.data?.results[0]?.name).toBe(currentQ);
  await act(async () => resolveOld({ ...page("personal"), results: [{ ...shelf, name: "stale" }] }));
  expect(state.pages.personal.data?.results[0]?.name).toBe(currentQ);
});

it("submits trimmed search through a native form, syncs the input, and clears it on scope change", async () => {
  const committed = vi.fn();
  await renderPage(undefined, undefined, "route query", committed);
  const input = container.querySelector<HTMLInputElement>('.shelfSearchForm input[type="search"]')!;
  const form = container.querySelector<HTMLFormElement>(".shelfSearchForm")!;
  expect(input.value).toBe("route query");
  expect(input.placeholder).toBe("Search shelves");
  expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe("Search");

  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "  history  ");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(committed).toHaveBeenLastCalledWith("history");
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "personal", q: "history", page: 1 }));

  await selectScope("Shared by Others");
  expect(input.value).toBe("");
  expect(input.placeholder).toBe("Search shelves or users");
  expect(list).toHaveBeenLastCalledWith(expect.not.objectContaining({ q: expect.anything() }));
  await selectScope("Group Shelves");
  expect(input.placeholder).toBe("Search shelves or groups");
});

it("removes q for a whitespace-only submission", async () => {
  const committed = vi.fn();
  await renderPage(undefined, undefined, "history", committed);
  const input = container.querySelector<HTMLInputElement>(".shelfSearchForm input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "   ");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(committed).toHaveBeenLastCalledWith("");
  expect(list).toHaveBeenLastCalledWith(expect.not.objectContaining({ q: expect.anything() }));
});

it("keeps old rows during a search and shows search-specific empty copy only after the response", async () => {
  let resolveSearch!: (value: PaginatedShelfResponse) => void;
  list.mockImplementation(({ q }: { q?: string }) => q
    ? new Promise<PaginatedShelfResponse>((resolve) => { resolveSearch = resolve; })
    : Promise.resolve(page("personal")));
  await renderPage();
  const input = container.querySelector<HTMLInputElement>(".shelfSearchForm input")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "missing");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(container.textContent).toContain("personal page 1");
  expect(container.textContent).not.toContain("Loading");
  expect(container.textContent).not.toContain("No personal shelves match this search.");
  await act(async () => resolveSearch(empty));
  expect(container.textContent).not.toContain("personal page 1");
  expect(container.textContent).toContain("No personal shelves match this search.");
});

it("shows only the active scope pager before its rows with server count", async () => {
  list.mockImplementation(({ scope }: { scope: ShelfScope }) => Promise.resolve(scope === "personal" ? empty : { ...page(scope, 1, 25), next: null }));
  await renderPage();
  expect(container.textContent).toContain("You do not have any personal shelves.");
  expect(container.querySelector('nav[aria-label="Personal pages"]')?.textContent).toContain("Page 1 of 1");
  await selectScope("Shared by Others");
  const pager = container.querySelector('nav[aria-label="Shared by Others pages"]')!;
  expect(pager.textContent).toContain("Page 1 of 2");
  expect(pager.querySelector(".collectionPagerStatus")?.textContent).toContain("25");
  expect(pager.querySelector<HTMLButtonElement>('button[aria-label="Next page of Shared by Others"]')?.disabled).toBe(false);
  expect(pager.compareDocumentPosition(container.querySelector(".shelfCard")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelectorAll("nav")).toHaveLength(1);
  await selectScope("Group Shelves");
  expect(container.querySelector('nav[aria-label="Shared by Others pages"]')).toBeNull();
  expect(container.querySelector('nav[aria-label="Group Shelves pages"]')).not.toBeNull();
});

it("keeps the sort toggle beside the active scope pager instead of in the page header", async () => {
  const onChangeOrdering = vi.fn();
  await renderPage(undefined, onChangeOrdering);
  expect(container.querySelector(".shelfHeaderControls .orderingControl")).toBeNull();
  const controls = container.querySelector('nav[aria-label="Personal pages"]')!;
  expect(controls.querySelector('[aria-label="Sort shelves"]')).not.toBeNull();
  const sort = controls.querySelector('[aria-label="Sort shelves"]')!;
  const pageSize = controls.querySelector(".collectionPagerPageSize")!;
  const previous = controls.querySelector('.pagerButtons button[aria-label="Previous page of Personal"]')!;
  expect(sort.compareDocumentPosition(pageSize) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(pageSize.compareDocumentPosition(previous) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(controls.compareDocumentPosition(container.querySelector(".shelfCard")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await act(async () => controls.querySelector<HTMLButtonElement>('.orderingControlButton[title="Most books"]')!.click());
  expect(onChangeOrdering).toHaveBeenCalledWith("-item_count");
  await renderPage("-item_count", onChangeOrdering);
  expect(container.querySelector('.shelfCollectionPager .orderingControlButton[title="Most books"]')?.getAttribute("aria-pressed")).toBe("true");
  await selectScope("Group Shelves");
  expect(container.querySelector('.shelfCollectionPager [aria-label="Sort shelves"]')).not.toBeNull();
  expect(container.querySelectorAll('[aria-label="Sort shelves"]')).toHaveLength(1);
});

it("shows scope-specific empty states", async () => {
  list.mockResolvedValue(empty);
  await renderPage();
  expect(container.textContent).toContain("You do not have any personal shelves.");
  await selectScope("Shared by Others");
  expect(container.textContent).toContain("No shelves shared by others.");
  await selectScope("Group Shelves");
  expect(container.textContent).toContain("No group shelves.");
  expect(container.querySelector('nav[aria-label="Group Shelves pages"]')?.textContent).toContain("Page 1 of 1");
});

it("resets all loaded pages on sort change and uses the new ordering on later scope visits", async () => {
  list.mockImplementation(({ scope, page: number }: { scope: ShelfScope; page: number }) => Promise.resolve(page(scope, number, 45)));
  await act(async () => root.render(<Harness />));
  await act(async () => state.pages.personal.next());
  await act(async () => root.render(<Harness activeScope="shared" />));
  await act(async () => state.pages.shared.next());
  await act(async () => root.render(<Harness activeScope="shared" ordering="-item_count" />));
  expect(state.pages.personal.data).toBeNull();
  expect(state.pages.personal.page).toBe(1);
  expect(state.pages.shared.page).toBe(1);
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "shared", ordering: "-item_count", page: 1 }));
  await act(async () => root.render(<Harness activeScope="personal" ordering="-item_count" />));
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "personal", ordering: "-item_count", page: 1 }));
});

it("shares one Shelf page size and resets all scope pages when it changes", async () => {
  list.mockImplementation(({ scope, page: number, pageSize }: { scope: ShelfScope; page: number; pageSize: number }) =>
    Promise.resolve({ ...page(scope, number, 65), next: number * pageSize < 65 ? "next" : null }));
  await act(async () => root.render(<Harness />));
  await act(async () => state.pages.personal.next());
  await act(async () => root.render(<Harness activeScope="shared" />));
  await act(async () => state.pages.shared.next());
  act(() => state.changePageSize(50));
  expect(state.pageSize).toBe(50);
  expect(state.pages.shared.page).toBe(1);
  expect(state.pages.personal.data).toBeNull();
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "shared", page: 1, pageSize: 50, previewLimit: 24 }));
  await act(async () => root.render(<Harness activeScope="personal" />));
  expect(state.pages.personal.page).toBe(1);
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "personal", page: 1, pageSize: 50, previewLimit: 24 }));
  expect(state.pages.group.data).toBeNull();
});

it("ignores a stale page result after a newer page request", async () => {
  let resolveOld!: (value: PaginatedShelfResponse) => void;
  list.mockImplementation(({ scope, page: number }: { scope: ShelfScope; page: number }) =>
    scope === "personal" && number === 2
      ? new Promise<PaginatedShelfResponse>((resolve) => { resolveOld = resolve; })
      : Promise.resolve(page(scope, number, 45)));
  await act(async () => root.render(<Harness />));
  act(() => state.pages.personal.next());
  await act(async () => state.pages.personal.reload());
  await act(async () => resolveOld({ ...page("personal", 2, 45), results: [{ ...shelf, name: "stale" }] }));
  expect(state.pages.personal.page).toBe(1);
  expect(state.pages.personal.data?.results[0]?.name).toBe("personal page 1");
});

it("lets a hidden scope finish into its own cache without replacing the visible scope", async () => {
  let resolveShared!: (value: PaginatedShelfResponse) => void;
  list.mockImplementation(({ scope }: { scope: ShelfScope }) => scope === "shared"
    ? new Promise<PaginatedShelfResponse>((resolve) => { resolveShared = resolve; })
    : Promise.resolve(page(scope)));
  await renderPage();
  await selectScope("Shared by Others");
  expect(container.textContent).toContain("personal page 1");
  expect(container.textContent).not.toContain("Loading shared by others shelves...");
  await selectScope("Group Shelves");
  await act(async () => resolveShared(page("shared")));
  expect(container.textContent).toContain("group page 1");
  expect(container.textContent).not.toContain("shared page 1");
  await selectScope("Shared by Others");
  expect(container.textContent).toContain("shared page 1");
  expect(list.mock.calls.filter(([query]) => query.scope === "shared")).toHaveLength(1);
});

it("ignores a stale sort response without replacing the active scope", async () => {
  let resolveOld!: (value: PaginatedShelfResponse) => void;
  list.mockReturnValueOnce(new Promise<PaginatedShelfResponse>((resolve) => { resolveOld = resolve; }));
  await act(async () => root.render(<Harness />));
  await act(async () => root.render(<Harness ordering="-item_count" />));
  await act(async () => resolveOld({ ...page("personal"), results: [{ ...shelf, name: "old sort" }] }));
  expect(state.pages.personal.data?.results[0]?.name).toBe("personal page 1");
});

it("rejects a page response from a replaced client", async () => {
  let resolveOld!: (value: PaginatedShelfResponse) => void;
  list.mockReturnValueOnce(new Promise<PaginatedShelfResponse>((resolve) => { resolveOld = resolve; }));
  await act(async () => root.render(<Harness />));
  const replacementList = vi.fn().mockResolvedValue({ ...page("personal"), results: [{ ...shelf, name: "replacement" }] });
  spl = { shelves: { list: replacementList } } as unknown as SecondPassClient;
  await act(async () => root.render(<Harness />));
  await act(async () => resolveOld({ ...page("personal"), results: [{ ...shelf, name: "old client" }] }));
  expect(state.pages.personal.data?.results[0]?.name).toBe("replacement");
  expect(replacementList).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ scope: "personal", page: 1 }));
});

it("keeps hidden scope results and errors isolated", async () => {
  list.mockImplementation(({ scope }: { scope: ShelfScope }) =>
    scope === "shared" ? Promise.reject(new Error("shared unavailable")) : Promise.resolve(page(scope)));
  await renderPage();
  await selectScope("Shared by Others");
  expect(container.textContent).toContain("Couldn't load shelves.");
  await selectScope("Personal");
  expect(container.textContent).toContain("personal page 1");
  expect(container.textContent).not.toContain("Couldn't load shelves.");
  await selectScope("Group Shelves");
  expect(container.textContent).toContain("group page 1");
  await selectScope("Shared by Others");
  expect(container.textContent).toContain("Couldn't load shelves.");
  expect(list.mock.calls.filter(([query]) => query.scope === "shared")).toHaveLength(1);
});

it("returns to the last valid page when a collection shrinks", async () => {
  let requests = 0;
  list.mockImplementation(({ scope, page: number }: { scope: ShelfScope; page: number }) => {
    requests += 1;
    return Promise.resolve(requests === 1 ? page(scope, 1, 21) : number === 2 ? empty : page(scope, 1, 1));
  });
  await act(async () => root.render(<Harness />));
  await act(async () => state.pages.personal.next());
  expect(state.pages.personal.page).toBe(1);
  expect(state.pages.personal.data?.count).toBe(1);
  expect(list.mock.calls.map(([query]) => query.page)).toEqual([1, 2, 1]);
});

it("refreshes loaded scopes after creation and preserves a failed draft", async () => {
  await act(async () => root.render(<Harness />));
  act(() => state.beginCreate());
  act(() => state.changeCreateDraft({ name: " New ", description: "", visibility: "private" }));
  create.mockRejectedValueOnce(new Error("failed"));
  await act(async () => state.createShelf());
  expect(state.createDraft.name).toBe(" New ");
  expect(state.mutationError).toBeTruthy();
  await act(async () => state.createShelf());
  expect(create).toHaveBeenLastCalledWith({ name: "New", description: "", visibility: "private", owner_type: "user" });
  expect(state.createOpen).toBe(false);
  expect(list).toHaveBeenCalledTimes(2);
});

it("refreshes each previously loaded scope at its last successful page", async () => {
  list.mockImplementation(({ scope, page: number }: { scope: ShelfScope; page: number }) => Promise.resolve(page(scope, number, 25)));
  await act(async () => root.render(<Harness />));
  await act(async () => state.pages.personal.next());
  await act(async () => root.render(<Harness activeScope="shared" />));
  act(() => state.changeCreateDraft({ name: "New", description: "", visibility: "private" }));
  await act(async () => state.createShelf());
  expect(list.mock.calls.map(([query]) => [query.scope, query.page])).toEqual([
    ["personal", 1], ["personal", 2], ["shared", 1], ["personal", 2], ["shared", 1],
  ]);
  expect(state.pages.personal.page).toBe(2);
  expect(state.pages.shared.page).toBe(1);
  expect(state.pages.group.data).toBeNull();
});

it("guards deletion and refreshes the loaded scope after success", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => root.render(<Harness />));
  await act(async () => state.deleteShelf({ ...shelf, owner_type: "group" }));
  expect(confirm).not.toHaveBeenCalled();
  await act(async () => state.deleteShelf(shelf));
  expect(remove).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await act(async () => state.deleteShelf(shelf));
  expect(remove).toHaveBeenCalledWith(shelf.id);
  expect(list).toHaveBeenCalledTimes(2);
});

it("does not refresh an old page after a pending delete finishes during paging", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  list.mockImplementation(({ scope, page: number }: { scope: ShelfScope; page: number }) => Promise.resolve(page(scope, number, 25)));
  await act(async () => root.render(<Harness />));
  let resolveDelete!: () => void;
  remove.mockReturnValueOnce(new Promise<void>((resolve) => { resolveDelete = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = state.deleteShelf(shelf); });
  await act(async () => state.pages.personal.next());
  await act(async () => { resolveDelete(); await pending; });
  expect(state.pages.personal.page).toBe(2);
  expect(list.mock.calls.map(([query]) => query.page)).toEqual([1, 2]);
});

it.each(["success", "failure"])("ignores an obsolete create %s after the sort changes", async (outcome) => {
  await act(async () => root.render(<Harness />));
  act(() => state.changeCreateDraft({ name: "Old", description: "", visibility: "private" }));
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  create.mockReturnValueOnce(new Promise<void>((done, fail) => { resolve = done; reject = fail; }));
  let pending!: Promise<void>;
  act(() => { pending = state.createShelf(); });
  await act(async () => root.render(<Harness ordering="-item_count" />));
  act(() => state.beginCreate());
  act(() => state.changeCreateDraft({ name: "Current", description: "", visibility: "private" }));
  await act(async () => { if (outcome === "success") resolve(); else reject(new Error("obsolete")); await pending; });
  expect(state.createOpen).toBe(true);
  expect(state.createDraft.name).toBe("Current");
  expect(state.mutationError).toBeNull();
  expect(list).toHaveBeenCalledTimes(2);
});

it("does not refresh with a replaced client after a pending delete", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(async () => root.render(<Harness />));
  let resolve!: () => void;
  remove.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
  let pending!: Promise<void>;
  act(() => { pending = state.deleteShelf(shelf); });
  const oldList = list;
  const replacementList = vi.fn().mockResolvedValue(page("personal"));
  spl = { shelves: { list: replacementList } } as unknown as SecondPassClient;
  await act(async () => root.render(<Harness />));
  await act(async () => { resolve(); await pending; });
  expect(oldList).toHaveBeenCalledTimes(1);
  expect(replacementList).toHaveBeenCalledTimes(1);
});

it("keeps create dialog focus and dismissal without reloading a scope", async () => {
  await renderPage();
  const opener = [...container.querySelectorAll("button")].find((button) => button.textContent === "Create personal shelf")!;
  await act(async () => { opener.focus(); opener.click(); });
  expect(container.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(list).toHaveBeenCalledTimes(1);
});

it("keeps whole-row Shelf navigation and cover-only Book navigation in Group scope", async () => {
  list.mockImplementation(({ scope }: { scope: ShelfScope }) => Promise.resolve(scope === "group" ? {
    ...page("group"),
    results: [{ ...shelf, id: "group-shelf", owner_type: "group", owner_group: { id: "group-1", name: "Sci-Fi Stack", is_public_group: true }, can_edit: false, item_count: 2, preview_books: [{ id: "book-1", title: "Preview Book", cover_url: null }] }],
  } : empty));
  await renderPage();
  await selectScope("Group Shelves");
  const card = container.querySelector(".shelfCard")!;
  expect(card.textContent).toContain("Sci-Fi Stack");
  expect(card.textContent).toContain("2 books");
  await act(async () => card.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(window.location.hash).toBe("#/shelves/group-shelf");
  window.location.hash = "#/shelves";
  await act(async () => card.querySelector(".shelfCardMain")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(window.location.hash).toBe("#/shelves/group-shelf");
  window.location.hash = "#/shelves";
  await act(async () => card.querySelector(".previewBookCoverButton")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(window.location.hash).toBe("#/shelves?book=book-1");
  expect(card.querySelectorAll(".previewBookCoverButton")).toHaveLength(1);
});

it("renders all returned previews and protects Personal metadata", async () => {
  list.mockResolvedValue({ ...page("personal"), results: [{
    ...shelf, visibility: "listed", item_count: 7, owner_user: { profile_id: "user-1", username: "reader" },
    preview_books: Array.from({ length: 7 }, (_, index) => ({ id: `book-${index}`, title: `Book ${index}`, cover_url: null })),
  }] });
  await renderPage();
  const card = container.querySelector(".shelfCard")!;
  expect(card.querySelector(".shelfCardMain")?.textContent).toContain("Public");
  expect(card.querySelector(".shelfCardMain")?.textContent).toContain("7 books");
  expect(card.querySelector(".shelfCardMain")?.textContent).not.toContain("<@reader>");
  expect(card.querySelectorAll(".previewBookCoverButton")).toHaveLength(7);
});
