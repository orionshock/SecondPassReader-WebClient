// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLibraryRouteRenderer } from "../app/routes/AppLibraryRoute.Renderer";

const onlineLibrary = vi.fn((_props: unknown) => <div>Server Library</div>);
const offlineLibrary = vi.fn((_props: unknown) => <div>Downloaded Library</div>);
const onlineHome = vi.fn((_props: unknown) => <div>Server Home</div>);
const offlineHome = vi.fn((_props: unknown) => <div>Saved Home</div>);

vi.mock("../features/library/LibraryBrowse.Page", () => ({
  LibraryBrowsePage: (props: unknown) => onlineLibrary(props),
}));

vi.mock("../features/library/offline/OfflineLibrary.Page", () => ({
  OfflineLibraryPage: (props: unknown) => offlineLibrary(props),
}));

vi.mock("../features/home/Home.Page", () => ({
  HomePage: (props: unknown) => onlineHome(props),
}));

vi.mock("../features/home/offline/OfflineHome.Page", () => ({
  OfflineHomePage: (props: unknown) => offlineHome(props),
}));

let container: HTMLDivElement;
let root: Root;

describe("Library connectivity branch", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
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

  it.each(["online", "unknown"] as const)("preserves the server Home path while %s", async (connectivity) => {
    await render(connectivity, { kind: "home" });

    expect(container.textContent).toContain("Server Home");
    expect(onlineHome).toHaveBeenCalledOnce();
    expect(offlineHome).not.toHaveBeenCalled();
  });
});

async function render(
  connectivity: "online" | "offline" | "unknown",
  route: { kind: "library" } | { kind: "home" } = { kind: "library" },
) {
  await act(async () => {
    root.render(
      <AppLibraryRouteRenderer
        route={route}
        profile={null}
        spl={null}
        connectivity={connectivity}
        offlineNamespaceKey="account-a"
        openedBook={null}
        readerRestoreError={null}
        onCloseReader={() => undefined}
        onRetryReaderRestore={() => undefined}
      />,
    );
  });
}
