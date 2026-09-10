// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLibraryRouteRenderer } from "../../../app/routes/AppLibraryRoute.Orchestrator";
import type { AppRoute } from "../../../app/AppNavigation.Router";
import type { OpenedBook } from "../../../features/reader/Reader.Types";

const onlineLibrary = vi.fn((_props: unknown) => <div>Server Library</div>);
const offlineLibrary = vi.fn((_props: unknown) => <div>Downloaded Library</div>);
const onlineHome = vi.fn((_props: unknown) => <div>Server Home</div>);
const offlineHome = vi.fn((_props: unknown) => <div>Saved Home</div>);
const sessions = vi.fn(() => <div>Server Sessions</div>);
const sessionDetail = vi.fn(() => <div>Server Session Detail</div>);
const shelves = vi.fn(() => <div>Server Shelves</div>);
const shelfDetail = vi.fn(() => <div>Server Shelf Detail</div>);
const shelfEdit = vi.fn(() => <div>Server Shelf Edit</div>);
const readingActivity = vi.fn((_props: unknown) => undefined);
let readerMounts = 0;
let readerUnmounts = 0;

vi.mock("../../../features/library/LibraryBrowsePage.UI", () => ({
  LibraryBrowsePage: (props: unknown) => onlineLibrary(props),
}));

vi.mock("../../../features/library/offline/OfflineLibraryPage.UI", () => ({
  OfflineLibraryPage: (props: unknown) => offlineLibrary(props),
}));

vi.mock("../../../features/home/HomePage.UI", () => ({
  HomePage: (props: unknown) => onlineHome(props),
}));

vi.mock("../../../features/home/offline/OfflineHomePage.UI", () => ({
  OfflineHomePage: (props: unknown) => offlineHome(props),
}));

vi.mock("../../../features/sessions/SessionsPage.UI", () => ({ SessionsPage: () => sessions() }));
vi.mock("../../../features/sessions/SessionDetailPage.UI", () => ({ SessionDetailPage: () => sessionDetail() }));
vi.mock("../../../features/shelves/ShelvesPage.UI", () => ({ ShelvesPage: () => shelves() }));
vi.mock("../../../features/shelves/ShelfDetailPage.UI", () => ({ ShelfDetailPage: () => shelfDetail() }));
vi.mock("../../../features/shelves/ShelfEditPage.UI", () => ({ ShelfEditPage: () => shelfEdit() }));
vi.mock("../../../features/reader/ReadingActivity.Orchestrator", () => ({ ReadingActivity: ReaderProbe }));

let container: HTMLDivElement;
let root: Root;

describe("Library connectivity branch", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    readerMounts = 0;
    readerUnmounts = 0;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("mounts only the downloaded Library while explicitly offline", async () => {
    await render("offline");

    expect(container.textContent).toContain("Downloaded Library");
    expect(offlineLibrary).toHaveBeenCalledOnce();
    expect(onlineLibrary).not.toHaveBeenCalled();
  });

  it("opens Offline Library Books through Book Detail route state", async () => {
    window.location.hash = "#/library";
    await render("offline");

    const props = offlineLibrary.mock.calls[0]?.[0] as { onViewBook(bookId: string): void };
    act(() => props.onViewBook("book-1"));

    expect(window.location.hash).toBe("#/library?book=book-1");
  });

  it.each(["online", "unknown"] as const)("preserves the server Library path while %s", async (connectivity) => {
    await render(connectivity);

    expect(container.textContent).toContain("Server Library");
    expect(onlineLibrary).toHaveBeenCalledOnce();
    expect(offlineLibrary).not.toHaveBeenCalled();
  });

  it("mounts only saved Home while explicitly offline", async () => {
    await render("offline", { kind: "home" });

    expect(container.textContent).toContain("Saved Home");
    expect(offlineHome).toHaveBeenCalledOnce();
    expect(onlineHome).not.toHaveBeenCalled();
  });

  it("opens saved Recent Books through Home Book Detail route state", async () => {
    window.location.hash = "#/home";
    await render("offline", { kind: "home" });

    const props = offlineHome.mock.calls[0]?.[0] as { onViewBook(bookId: string): void };
    act(() => props.onViewBook("book-1"));

    expect(window.location.hash).toBe("#/home?book=book-1");
  });

  it.each(["online", "unknown"] as const)("preserves the server Home path while %s", async (connectivity) => {
    await render(connectivity, { kind: "home" });

    expect(container.textContent).toContain("Server Home");
    expect(onlineHome).toHaveBeenCalledOnce();
    expect(offlineHome).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "sessions" } as const, sessions],
    [{ kind: "session", sessionId: "session-1" } as const, sessionDetail],
    [{ kind: "shelves" } as const, shelves],
    [{ kind: "shelf", shelfId: "shelf-1" } as const, shelfDetail],
    [{ kind: "shelfEdit", shelfId: "shelf-1" } as const, shelfEdit],
  ])("does not mount the server owner for $0.kind while offline", async (route, serverOwner) => {
    await render("offline", route);

    expect(container.textContent).toContain("unavailable offline");
    expect(serverOwner).not.toHaveBeenCalled();
  });

  it("returns an online-only route to its server owner after connectivity returns", async () => {
    const route = { kind: "sessions" } as const;
    await render("offline", route);
    expect(sessions).not.toHaveBeenCalled();

    await render("online", route);
    expect(container.textContent).toContain("Server Sessions");
    expect(sessions).toHaveBeenCalledOnce();
  });

  it("keeps an open Reader mounted across connectivity changes", async () => {
    const openedBook = { book: { id: "book-1" }, objectUrl: "blob:book-1", source: "online" } as unknown as OpenedBook;
    await render("online", { kind: "reader", bookId: "book-1" }, openedBook);
    expect(readerMounts).toBe(1);

    await render("offline", { kind: "reader", bookId: "book-1" }, openedBook);

    expect(readerMounts).toBe(1);
    expect(readerUnmounts).toBe(0);
    expect(readingActivity.mock.calls.at(-1)?.[0]).toMatchObject({ connectivity: "offline", openedBook });
  });
});

async function render(
  connectivity: "online" | "offline" | "unknown",
  route: AppRoute = { kind: "library" },
  openedBook: OpenedBook | null = null,
) {
  await act(async () => {
    root.render(
      <AppLibraryRouteRenderer
        route={route}
        profile={null}
        spl={null}
        connectivity={connectivity}
        offlineNamespaceKey="account-a"
        openedBook={openedBook}
        readerRestoreError={null}
        onCloseReader={() => undefined}
        onRetryReaderRestore={() => undefined}
      />,
    );
  });
}

function ReaderProbe(props: unknown) {
  readingActivity(props);
  useEffect(() => {
    readerMounts += 1;
    return () => { readerUnmounts += 1; };
  }, []);
  return <div>Reader</div>;
}
