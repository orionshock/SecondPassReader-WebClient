// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderRendererCapability } from "../../../features/reader/domain/ReaderBridge.Types";
import { useReadingSessionBridgeController } from "../../../features/reader/session/ReadingSessionBridge.Controller";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

describe("Reading Session renderer bridge", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("publishes and clears the renderer capability as one Book-scoped value", async () => {
    let bridge!: ReturnType<typeof useReadingSessionBridgeController>;
    await render("book-a");
    expect(bridge.rendererCapability).toBeNull();

    const capability = rendererCapability();
    await act(async () => bridge.handleRendererCapabilityReady(capability));
    expect(bridge.rendererCapability).toBe(capability);

    await render("book-b");
    expect(bridge.rendererCapability).toBeNull();

    async function render(activeBookKey: string) {
      await act(async () => root.render(
        <Harness activeBookKey={activeBookKey} onValue={(value) => { bridge = value; }} />,
      ));
    }
  });

  it("routes renderer failures through bounded Reader diagnostics", async () => {
    window.localStorage.setItem("secondpass.debug.logs", "reader");
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let bridge!: ReturnType<typeof useReadingSessionBridgeController>;
    await act(async () => root.render(
      <Harness activeBookKey="book-a" onValue={(value) => { bridge = value; }} />,
    ));

    act(() => bridge.handleShellEvent({
      type: "displayError",
      error: new TypeError("private publication URL"),
    }));

    expect(consoleWarn).toHaveBeenCalledWith(
      "[SPR reader] renderer display failed",
      { errorType: "TypeError" },
    );
  });
});

function Harness({
  activeBookKey,
  onValue,
}: {
  activeBookKey: string;
  onValue: (value: ReturnType<typeof useReadingSessionBridgeController>) => void;
}) {
  onValue(useReadingSessionBridgeController({ activeBookKey }));
  return null;
}

function rendererCapability(): ReaderRendererCapability {
  return {
    describeCfi: vi.fn(async (cfi) => ({ cfi })),
    probeCfi: vi.fn(async () => ({ ok: false as const, code: "unsupported" as const, error: "test" })),
    displayCfi: vi.fn(async () => ({ ok: false as const, code: "unsupported" as const, error: "test" })),
    searchBook: vi.fn(async () => []),
    stagedSelection: {
      stageSelectionFromCfiRange: vi.fn(async () => undefined),
      runStagingTransaction: vi.fn(async (operation) => operation()),
      cancelStagedSelection: vi.fn(),
    },
  };
}
