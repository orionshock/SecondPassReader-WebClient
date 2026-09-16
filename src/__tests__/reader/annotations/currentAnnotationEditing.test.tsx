// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentAnnotationEditingController } from "../../../features/reader/annotations/CurrentAnnotationEditing.Controller";

describe("current annotation editing", () => {
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
  });

  afterEach(() => act(() => root.unmount()));

  it("owns draft seeding, switching, cancellation, and stable client identity", async () => {
    const harness = await mountHarness(root);

    act(() => harness.controller.begin({
      clientId: "client-a",
      annotationId: "server-a",
      note: "Canonical A",
      color: "yellow",
    }));
    act(() => {
      harness.controller.changeNote("Draft A");
      harness.controller.changeColor("blue");
    });
    expect(harness.controller.state).toEqual(expect.objectContaining({
      clientId: "client-a",
      annotationId: "server-a",
      draftNote: "Draft A",
      draftColor: "blue",
    }));

    await harness.render([{ clientId: "client-a", annotationId: "server-a-replaced" }]);
    expect(harness.controller.state).toEqual(expect.objectContaining({
      clientId: "client-a",
      annotationId: "server-a-replaced",
      draftNote: "Draft A",
    }));

    act(() => harness.controller.begin({
      clientId: "client-b",
      annotationId: "server-b",
      note: "Canonical B",
      color: "pink",
    }));
    expect(harness.controller.state).toEqual(expect.objectContaining({
      clientId: "client-b",
      draftNote: "Canonical B",
      draftColor: "pink",
    }));

    act(() => harness.controller.cancel());
    expect(harness.controller.state).toBeNull();
  });

  it("retains a failed draft, prevents duplicate saves, and closes after success", async () => {
    const saveGate = deferred<void>();
    const onUpdateHighlight = vi.fn(() => saveGate.promise);
    const harness = await mountHarness(root, onUpdateHighlight);
    act(() => harness.controller.begin({
      clientId: "stable-client",
      annotationId: "server-id",
      note: "Draft",
      color: "green",
    }));

    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    act(() => {
      first = harness.controller.save();
      duplicate = harness.controller.save();
    });
    expect(onUpdateHighlight).toHaveBeenCalledOnce();
    expect(onUpdateHighlight).toHaveBeenCalledWith("server-id", { note: "Draft", color: "green" });
    saveGate.resolve();
    await act(async () => Promise.all([first, duplicate]));
    expect(harness.controller.state).toBeNull();

    onUpdateHighlight.mockRejectedValueOnce(new Error("failed"));
    act(() => harness.controller.begin({
      clientId: "stable-client",
      annotationId: "new-server-id",
      note: "Keep me",
      color: "purple",
    }));
    await act(async () => harness.controller.save());
    expect(harness.controller.state).toEqual(expect.objectContaining({
      clientId: "stable-client",
      draftNote: "Keep me",
      status: "error",
      error: "Couldn't update the highlight. Try again.",
    }));
  });

  it("clears editing when the canonical annotation is deleted", async () => {
    const harness = await mountHarness(root);
    act(() => harness.controller.begin({
      clientId: "deleted-client",
      annotationId: "server-id",
      note: "Draft",
      color: "yellow",
    }));

    await harness.render([]);

    expect(harness.controller.state).toBeNull();
  });
});

async function mountHarness(
  root: Root,
  onUpdateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>
    = vi.fn(async () => undefined),
) {
  let controller!: ReturnType<typeof useCurrentAnnotationEditingController>;
  let currentHighlights: readonly { clientId: string; annotationId: string }[] = [
    { clientId: "client-a", annotationId: "server-a" },
    { clientId: "client-b", annotationId: "server-b" },
    { clientId: "stable-client", annotationId: "server-id" },
    { clientId: "deleted-client", annotationId: "server-id" },
  ];

  function Harness() {
    controller = useCurrentAnnotationEditingController({
      currentHighlights,
      onUpdateHighlight,
    });
    return null;
  }

  const render = async (highlights: readonly { clientId: string; annotationId: string }[]) => {
    currentHighlights = highlights;
    await act(async () => root.render(<Harness />));
  };
  await render(currentHighlights);
  return {
    get controller() { return controller; },
    render,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
