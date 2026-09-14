// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { presentAppPage } from "../../app/AppPage.Presenter";
import { useAppPagePresentationLifecycle } from "../../app/AppPagePresentation.Lifecycle";
import type { AppRoute } from "../../app/AppNavigation.Router";

describe("App page presentation", () => {
  it("maps routes to titles and route-level focus identities", () => {
    expect(presentAppPage({ kind: "home" }, "library_home")).toMatchObject({
      view: "main",
      title: "Second Pass Reader - Home",
      focusKey: "library_home:home:",
    });
    expect(presentAppPage({ kind: "session", sessionId: "session-1" }, "library_home").focusKey)
      .toBe("library_home:session:session-1");
    expect(presentAppPage({ kind: "reader", bookId: "book-1" }, "library_home", "The Book"))
      .toMatchObject({ title: "Second Pass Reader - The Book", focusKey: "library_home:reader:book-1" });
    expect(presentAppPage({ kind: "settings", tab: "offline" }, "library_home"))
      .toMatchObject({ view: "settings", title: "Second Pass Reader - Settings", focusKey: "settings" });
  });

  it("keeps Book Detail query changes under the page focus identity", () => {
    expect(presentAppPage({ kind: "home" }, "library_home").focusKey)
      .toBe(presentAppPage({ kind: "home", bookId: "book-1" }, "library_home").focusKey);
    expect(presentAppPage({ kind: "library", browse: "books" }, "library_home").focusKey)
      .toBe(presentAppPage({ kind: "library", browse: "books", bookId: "book-1" }, "library_home").focusKey);
  });
});

describe("App page presentation lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("updates title and focuses only for a new page identity", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    act(() => root.render(<Harness route={{ kind: "home" }} />));
    expect(document.title).toBe("Second Pass Reader - Home");
    expect(focus).not.toHaveBeenCalled();

    act(() => root.render(<Harness route={{ kind: "home", bookId: "book-1" }} />));
    expect(focus).not.toHaveBeenCalled();

    act(() => root.render(<Harness route={{ kind: "reader", bookId: "book-1" }} readerBookTitle="The Book" />));
    expect(document.title).toBe("Second Pass Reader - The Book");
    expect(focus).toHaveBeenCalledOnce();
  });
});

function Harness({ route, readerBookTitle }: { route: AppRoute; readerBookTitle?: string }) {
  const { mainRef } = useAppPagePresentationLifecycle({ route, workflowStep: "library_home", readerBookTitle });
  return <main ref={mainRef} tabIndex={-1} />;
}
