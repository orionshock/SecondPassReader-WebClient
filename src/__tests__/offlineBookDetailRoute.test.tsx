// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppBookDetailModalController } from "../app/routes/AppBookDetailModal.Controller";

const serverDialog = vi.fn((_props: unknown) => <div>Server Book Detail</div>);
const offlineDialog = vi.fn((_props: unknown) => <div>Saved Book Detail</div>);

vi.mock("../features/library/BookDetailModal.UI", () => ({
  BookDetailModal: (props: unknown) => serverDialog(props),
}));

vi.mock("../features/library/bookDetail/offline/OfflineBookDetailDialog.UI", () => ({
  OfflineBookDetailDialog: (props: unknown) => offlineDialog(props),
}));

let container: HTMLDivElement;
let root: Root;

describe("Book Detail connectivity branch", () => {
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

  it("mounts only local Book Detail while explicitly offline", async () => {
    await render("offline");

    expect(container.textContent).toContain("Saved Book Detail");
    expect(offlineDialog).toHaveBeenCalledWith(expect.objectContaining({
      namespaceKey: "account-a",
      bookId: "book-1",
    }));
    expect(serverDialog).not.toHaveBeenCalled();
  });

  it.each(["online", "unknown"] as const)("preserves server Book Detail while %s", async (connectivity) => {
    await render(connectivity);

    expect(container.textContent).toContain("Server Book Detail");
    expect(serverDialog).toHaveBeenCalledOnce();
    expect(offlineDialog).not.toHaveBeenCalled();
  });

  it("does not expose local detail without a verified namespace", async () => {
    await render("offline", null);

    expect(offlineDialog).toHaveBeenCalledWith(expect.objectContaining({ namespaceKey: null }));
    expect(serverDialog).not.toHaveBeenCalled();
  });
});

async function render(connectivity: "online" | "offline" | "unknown", namespaceKey: string | null = "account-a") {
  await act(async () => {
    root.render(
      <AppBookDetailModalController
        route={{ kind: "home", bookId: "book-1" }}
        profile={null}
        spl={null}
        connectivity={connectivity}
        offlineNamespaceKey={namespaceKey}
        onOpenReader={vi.fn()}
      />,
    );
  });
}
